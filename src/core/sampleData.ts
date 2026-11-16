/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Species Sample Herd & Lineage Seeder.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Provides authentic 3- to 6-generation pedigree trees (with ~half of active animals having a
 * complete 6-generation pedigree backed by archived/inactive foundation ancestors), active breedings,
 * cascaded Master Task List chores, cage/pen locations, weight/leg logs, and show rosters for ALL
 * predefined species—led by an ARBA-standard New Zealand Red rabbitry.
 */

import { parseGenotypeString } from './geneticsEngine';
import {
  addDaysIso,
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
} from './models';
import { calculatePairingCoi } from './pedigreeCalculator';
import { generateCascadedTasksForBreeding } from './taskMaster';

interface SeedFamilySpec {
  species: string;
  breed: string;
  varietyA: string;
  varietyB: string;
  tagPrefix: string;
  breederName: string;
  cagePrefix: string;
  avgAdultGrams: number;
  juniorGrams: number;
  genoPgs?: string;
  genoPgd?: string;
  genoMgs?: string;
  genoMgd?: string;
  genoSire?: string;
  genoDam?: string;
  genoSubject?: string;
  names: {
    pgs: string; // Paternal Grandsire
    pgd: string; // Paternal Granddam
    mgs: string; // Maternal Grandsire (can match pgs on purpose in some herds or stay distinct)
    mgd: string; // Maternal Granddam
    sire: string;
    dam: string;
    juniorFemale: string;
    juniorMale: string;
  };
  shareGrandsireForLinebreeding?: boolean;
  sanctionBody: string;
  showTitle: string;
  showLocation: string;
}

const SPECIES_SEED_SPECS: SeedFamilySpec[] = [
  {
    species: 'Rabbit',
    breed: 'New Zealand',
    varietyA: 'Red',
    varietyB: 'Red',
    tagPrefix: 'NZR',
    breederName: 'Copper Creek Rabbitry',
    cagePrefix: 'Hutch R',
    avgAdultGrams: 4650, // ~10 lb 4 oz ARBA Senior New Zealand Red
    juniorGrams: 2950,
    genoPgs: 'AA BB CC DD ee ww',
    genoPgd: 'AA Bb CC DD ee ww',
    genoMgs: 'AA BB CC DD ee ww',
    genoMgd: 'Aa BB CC Dd ee ww',
    genoSire: 'AA Bb CC DD ee ww',
    genoDam: 'Aa BB CC Dd ee ww',
    genoSubject: 'AA B_ CC D_ ee ww',
    names: {
      pgs: 'Copper Creek Red Baron',
      pgd: 'Autumn Briar Scarlet',
      mgs: 'Redwood Ridge Rusty',
      mgd: 'Cinnamon Hollow Ember',
      sire: 'Copper Creek Firestorm',
      dam: 'Copper Creek Crimson Clover',
      juniorFemale: 'Copper Creek Ruby Rose',
      juniorMale: 'Copper Creek Blaze',
    },
    shareGrandsireForLinebreeding: true, // Classic mild linebreeding on Red Baron (12.5% COI)
    sanctionBody: 'ARBA',
    showTitle: 'Pacific Northwest ARBA All-Breed Show',
    showLocation: 'County Fairgrounds Pavilion',
  },
  {
    species: 'Goat',
    breed: 'Nigerian Dwarf',
    varietyA: 'Gold & White',
    varietyB: 'Buckskin',
    tagPrefix: 'NDG',
    breederName: ' Meadowbrook Dairy Goats',
    cagePrefix: 'Pen G',
    avgAdultGrams: 34000, // ~75 lbs
    juniorGrams: 16500,
    names: {
      pgs: 'Cedar Glen Orion *B',
      pgd: 'Willow Run Honeybee 2*M',
      mgs: ' Cloverleaf Atlas *B',
      mgd: 'Meadowbrook Marigold',
      sire: 'Meadowbrook Ranger *B',
      dam: 'Meadowbrook Sweet Clover 3*M',
      juniorFemale: 'Meadowbrook Buttercup',
      juniorMale: 'Meadowbrook Flint',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'ADGA / AGS',
    showTitle: 'Spring Dairy Goat Classic',
    showLocation: 'Valley Livestock Arena',
  },
  {
    species: 'Sheep',
    breed: 'Katahdin',
    varietyA: 'Red & White',
    varietyB: 'Tan',
    tagPrefix: 'KAT',
    breederName: 'Rolling Hills Hair Sheep',
    cagePrefix: 'Paddock S',
    avgAdultGrams: 68000, // ~150 lbs
    juniorGrams: 31000,
    names: {
      pgs: 'Oakridge Monarch',
      pgd: 'Oakridge Fern',
      mgs: 'Prairie Wind Summit',
      mgd: 'Prairie Wind Laurel',
      sire: 'Rolling Hills Granite',
      dam: 'Rolling Hills Juniper',
      juniorFemale: 'Rolling Hills Hazel',
      juniorMale: 'Rolling Hills Canyon',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'County / State Fair',
    showTitle: 'Autumn Hair Sheep & Forage Expo',
    showLocation: 'Tri-County Ag Center',
  },
  {
    species: 'Swine / Pig',
    breed: 'Berkshire',
    varietyA: 'Black w/ Six White Points',
    varietyB: 'Heritage Black',
    tagPrefix: 'BRK',
    breederName: 'Heritage Oak Farm',
    cagePrefix: 'Pasture Bay P',
    avgAdultGrams: 215000, // ~474 lbs
    juniorGrams: 48000,
    names: {
      pgs: 'Ironwood Duke',
      pgd: 'Ironwood Duchess',
      mgs: 'Acorn Hollow Major',
      mgd: 'Acorn Hollow Pearl',
      sire: 'Heritage Oak Blacksmith',
      dam: 'Heritage Oak Maple',
      juniorFemale: 'Heritage Oak Poppy',
      juniorMale: 'Heritage Oak Forge',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: '4-H / FFA',
    showTitle: 'Regional Heritage Swine Showcase',
    showLocation: 'Heritage Barn Complex',
  },
  {
    species: 'Cattle',
    breed: 'Dexter',
    varietyA: 'Red Non-Chondro',
    varietyB: 'Dun',
    tagPrefix: 'DEX',
    breederName: 'Greenbrier Homestead',
    cagePrefix: 'Pasture C',
    avgAdultGrams: 340000, // ~750 lbs Dexter
    juniorGrams: 135000,
    names: {
      pgs: 'Kerry Glen Fergus',
      pgd: 'Kerry Glen Fiona',
      mgs: 'Highland Brook Rowan',
      mgd: 'Highland Brook Maeve',
      sire: 'Greenbrier Cormac',
      dam: 'Greenbrier Brigid',
      juniorFemale: 'Greenbrier Saoirse',
      juniorMale: 'Greenbrier Declan',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'Specialty Club',
    showTitle: 'American Dexter Homestead Gathering',
    showLocation: 'State Agricultural Park',
  },
  {
    species: 'Guinea Pig',
    breed: 'Abyssinian',
    varietyA: 'Red',
    varietyB: 'Brindle',
    tagPrefix: 'ABY',
    breederName: 'Clover Patch Caviary',
    cagePrefix: 'Cavy Loft CV',
    avgAdultGrams: 1050, // ~2 lb 5 oz
    juniorGrams: 580,
    names: {
      pgs: 'Clover Patch Nutmeg',
      pgd: 'Clover Patch Ginger',
      mgs: 'Sunbeam Barnaby',
      mgd: 'Sunbeam Cinnamon',
      sire: 'Clover Patch Rosette King',
      dam: 'Clover Patch Clementine',
      juniorFemale: 'Clover Patch Pippin',
      juniorMale: 'Clover Patch Acorn',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'ARBA',
    showTitle: 'Cavy Breeders Specialty Show',
    showLocation: 'Civic Expo Hall',
  },
  {
    species: 'Chinchilla',
    breed: 'Standard Chinchilla',
    varietyA: 'Standard Gray',
    varietyB: 'Violet',
    tagPrefix: 'CHN',
    breederName: 'Andes Mist Chinchillas',
    cagePrefix: 'Tower CH',
    avgAdultGrams: 680,
    juniorGrams: 410,
    names: {
      pgs: 'Andes Mist Sterling',
      pgd: 'Andes Mist Cloud',
      mgs: 'Silver Peak Zephyr',
      mgd: 'Silver Peak Lavender',
      sire: 'Andes Mist Slate',
      dam: 'Andes Mist Amethyst',
      juniorFemale: 'Andes Mist Whisper',
      juniorMale: 'Andes Mist Quartz',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'Specialty Club',
    showTitle: 'Empress / Mutation Chinchilla Classic',
    showLocation: 'Mountain View Hall',
  },
  {
    species: 'Ferret',
    breed: 'Domestic Ferret',
    varietyA: 'Sable',
    varietyB: 'Cinnamon',
    tagPrefix: 'FRT',
    breederName: 'Woodland Hollow Ferretry',
    cagePrefix: 'Suite F',
    avgAdultGrams: 1250,
    juniorGrams: 690,
    names: {
      pgs: 'Woodland Bandit',
      pgd: 'Woodland Willow',
      mgs: 'Pine Creek Jasper',
      mgd: 'Pine Creek Nutmeg',
      sire: 'Woodland Ranger',
      dam: 'Woodland Maple',
      juniorFemale: 'Woodland Cricket',
      juniorMale: 'Woodland Scout',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'Specialty Club',
    showTitle: 'Autumn Ferret Championship',
    showLocation: 'Community Event Center',
  },
  {
    species: 'Alpaca',
    breed: 'Huacaya',
    varietyA: 'Medium Fawn',
    varietyB: 'Light Brown',
    tagPrefix: 'ALP',
    breederName: 'Sierra Fiber Alpacas',
    cagePrefix: 'Paddock A',
    avgAdultGrams: 64000, // ~141 lbs
    juniorGrams: 28000,
    names: {
      pgs: 'Sierra Gold Inca',
      pgd: 'Sierra Gold Sierra',
      mgs: 'Altiplano Santiago',
      mgd: 'Altiplano Paloma',
      sire: 'Sierra Fiber Cusco',
      dam: 'Sierra Fiber Marisol',
      juniorFemale: 'Sierra Fiber Luna',
      juniorMale: 'Sierra Fiber Mateo',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'Specialty Club',
    showTitle: 'Western Fleece & Halter Futurity',
    showLocation: 'Regional Equine & Fiber Pavilion',
  },
  {
    species: 'Dog',
    breed: 'Golden Retriever',
    varietyA: 'Medium Golden',
    varietyB: 'Dark Golden',
    tagPrefix: 'DOG',
    breederName: 'Timberline Goldens',
    cagePrefix: 'Kennel D',
    avgAdultGrams: 29500, // ~65 lbs
    juniorGrams: 11500,
    names: {
      pgs: 'Timberline Cedar Ridge',
      pgd: 'Timberline Honeybell',
      mgs: 'Suncrest Maverick',
      mgd: 'Suncrest Willow',
      sire: 'Timberline Copperfield',
      dam: 'Timberline Autumn Breeze',
      juniorFemale: 'Timberline Meadow',
      juniorMale: 'Timberline Tucker',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'AKC / UKC',
    showTitle: 'Pacific Northwest All-Breed Kennel Classic',
    showLocation: 'Metro Exhibition Pavilion',
  },
  {
    species: 'Cat',
    breed: 'Maine Coon',
    varietyA: 'Brown Classic Tabby',
    varietyB: 'Silver Torbie & White',
    tagPrefix: 'CAT',
    breederName: 'Whispering Pines Cattery',
    cagePrefix: 'Suite C',
    avgAdultGrams: 6400, // ~14 lbs
    juniorGrams: 2800,
    names: {
      pgs: 'Whispering Pines Magnus',
      pgd: 'Whispering Pines Freya',
      mgs: 'Nordic Crown Thorin',
      mgd: 'Nordic Crown Astrid',
      sire: 'Whispering Pines Lynx',
      dam: 'Whispering Pines Aurora',
      juniorFemale: 'Whispering Pines Willow',
      juniorMale: 'Whispering Pines Jasper',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'CFA / TICA',
    showTitle: 'Cascade Feline Championship',
    showLocation: 'Harborview Convention Hall',
  },
];

/**
 * Generates deterministic, human-readable IDs per species so re-seeding a species updates
 * existing sample records cleanly without creating duplicate ghosts.
 */
function seedId(speciesSlug: string, suffix: string): string {
  return `seed-${speciesSlug}-${suffix}`;
}

/**
 * Returns true if an entity ID belongs to built-in sample/testing seed data (`seed-...`).
 */
export function isSampleTestingId(id: string | undefined | null): boolean {
  return Boolean(id && id.startsWith('seed-'));
}

/**
 * Counts how many seeded sample/testing records currently exist for `speciesName`
 * (including any photos, care logs, or chores attached to seeded animals/breedings).
 */
export function countSpeciesTestingRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  const seedAnimalIds = new Set(
    snapshot.animals
      .filter((a) => isSameSpecies(a.species, speciesName) && isSampleTestingId(a.id))
      .map((a) => a.id)
  );
  const seedBreedingIds = new Set(
    snapshot.breedings
      .filter((b) => isSameSpecies(b.species, speciesName) && isSampleTestingId(b.id))
      .map((b) => b.id)
  );

  const photos = (snapshot.animalPhotos ?? []).filter(
    (p) =>
      isSameSpecies(p.species, speciesName) &&
      (isSampleTestingId(p.id) || seedAnimalIds.has(p.animalId))
  ).length;
  const cages = snapshot.cages.filter(
    (c) => isSameSpecies(c.species, speciesName) && isSampleTestingId(c.id)
  ).length;
  const tasks = snapshot.tasks.filter(
    (t) =>
      isSameSpecies(t.species, speciesName) &&
      (isSampleTestingId(t.id) ||
        seedAnimalIds.has(t.linkedAnimalId) ||
        seedBreedingIds.has(t.linkedBreedingId))
  ).length;
  const careLogs = snapshot.careLogs.filter(
    (l) =>
      isSameSpecies(l.species, speciesName) &&
      (isSampleTestingId(l.id) || seedAnimalIds.has(l.animalId))
  ).length;
  const shows = snapshot.shows.filter(
    (s) => isSameSpecies(s.species, speciesName) && isSampleTestingId(s.id)
  ).length;

  return seedAnimalIds.size + seedBreedingIds.size + photos + cages + tasks + careLogs + shows;
}

/**
 * Counts all records (animals, photos, cages, breedings, tasks, careLogs, shows) scoped to `speciesName`.
 */
export function countAllSpeciesRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  const animals = snapshot.animals.filter((a) => isSameSpecies(a.species, speciesName)).length;
  const photos = (snapshot.animalPhotos ?? []).filter((p) =>
    isSameSpecies(p.species, speciesName)
  ).length;
  const cages = snapshot.cages.filter((c) => isSameSpecies(c.species, speciesName)).length;
  const breedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, speciesName)).length;
  const tasks = snapshot.tasks.filter((t) => isSameSpecies(t.species, speciesName)).length;
  const careLogs = snapshot.careLogs.filter((l) => isSameSpecies(l.species, speciesName)).length;
  const shows = snapshot.shows.filter((s) => isSameSpecies(s.species, speciesName)).length;

  return animals + photos + cages + breedings + tasks + careLogs + shows;
}

/**
 * Counts non-testing (real / imported / user-entered) records scoped to `speciesName`,
 * strictly complementary to `countSpeciesTestingRecords`.
 */
export function countSpeciesNonTestingRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  return Math.max(
    0,
    countAllSpeciesRecords(snapshot, speciesName) -
      countSpeciesTestingRecords(snapshot, speciesName)
  );
}

/**
 * Pure helper: deletes ONLY seeded testing data (`seed-...`) inside `speciesName`,
 * keeping real/imported records in `speciesName` and leaving every other species untouched.
 */
export function purgeSpeciesTestingDataPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const ts = nowIsoUtc();
  const removedAnimalIds = new Set<string>();
  const removedBreedingIds = new Set<string>();
  let removedTotalRecords = 0;

  for (const a of snapshot.animals) {
    if (isSameSpecies(a.species, speciesName) && isSampleTestingId(a.id)) {
      removedAnimalIds.add(a.id);
    }
  }
  for (const b of snapshot.breedings) {
    if (isSameSpecies(b.species, speciesName) && isSampleTestingId(b.id)) {
      removedBreedingIds.add(b.id);
    }
  }

  const nextAnimals = snapshot.animals
    .filter((a) => {
      if (removedAnimalIds.has(a.id)) {
        removedTotalRecords++;
        return false;
      }
      return true;
    })
    .map((a) => {
      if (!isSameSpecies(a.species, speciesName)) return a;
      const clearSire = a.sireId && removedAnimalIds.has(a.sireId);
      const clearDam = a.damId && removedAnimalIds.has(a.damId);
      if (!clearSire && !clearDam) return a;
      return {
        ...a,
        sireId: clearSire ? '' : a.sireId,
        damId: clearDam ? '' : a.damId,
        updatedAt: ts,
      };
    });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    const remove =
      isSameSpecies(p.species, speciesName) &&
      (isSampleTestingId(p.id) || removedAnimalIds.has(p.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCages = snapshot.cages.filter((c) => {
    const remove = isSameSpecies(c.species, speciesName) && isSampleTestingId(c.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (removedBreedingIds.has(b.id)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    const remove =
      isSameSpecies(t.species, speciesName) &&
      (isSampleTestingId(t.id) ||
        removedAnimalIds.has(t.linkedAnimalId) ||
        removedBreedingIds.has(t.linkedBreedingId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    const remove =
      isSameSpecies(l.species, speciesName) &&
      (isSampleTestingId(l.id) || removedAnimalIds.has(l.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextShows = snapshot.shows
    .filter((s) => {
      const remove = isSameSpecies(s.species, speciesName) && isSampleTestingId(s.id);
      if (remove) removedTotalRecords++;
      return !remove;
    })
    .map((s) => {
      if (!isSameSpecies(s.species, speciesName)) return s;
      const filteredIds = s.enteredAnimalIds.filter((id) => !removedAnimalIds.has(id));
      if (filteredIds.length === s.enteredAnimalIds.length) return s;
      return { ...s, enteredAnimalIds: filteredIds, updatedAt: ts };
    });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

/**
 * Pure helper: deletes ONLY non-testing (user-entered / imported) records inside `speciesName`,
 * preserving any seeded testing records (`seed-...`), the `SpeciesProfile`, and all other species.
 */
export function purgeSpeciesNonTestingDataPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const ts = nowIsoUtc();
  const removedAnimalIds = new Set<string>();
  const removedBreedingIds = new Set<string>();
  let removedTotalRecords = 0;

  for (const a of snapshot.animals) {
    if (isSameSpecies(a.species, speciesName) && !isSampleTestingId(a.id)) {
      removedAnimalIds.add(a.id);
    }
  }
  for (const b of snapshot.breedings) {
    if (isSameSpecies(b.species, speciesName) && !isSampleTestingId(b.id)) {
      removedBreedingIds.add(b.id);
    }
  }

  const nextAnimals = snapshot.animals
    .filter((a) => {
      if (removedAnimalIds.has(a.id)) {
        removedTotalRecords++;
        return false;
      }
      return true;
    })
    .map((a) => {
      if (!isSameSpecies(a.species, speciesName)) return a;
      const clearSire = a.sireId && removedAnimalIds.has(a.sireId);
      const clearDam = a.damId && removedAnimalIds.has(a.damId);
      if (!clearSire && !clearDam) return a;
      return {
        ...a,
        sireId: clearSire ? '' : a.sireId,
        damId: clearDam ? '' : a.damId,
        updatedAt: ts,
      };
    });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    const remove =
      isSameSpecies(p.species, speciesName) &&
      (!isSampleTestingId(p.id) || removedAnimalIds.has(p.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCages = snapshot.cages.filter((c) => {
    const remove = isSameSpecies(c.species, speciesName) && !isSampleTestingId(c.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (removedBreedingIds.has(b.id)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    const remove =
      isSameSpecies(t.species, speciesName) &&
      (!isSampleTestingId(t.id) ||
        removedAnimalIds.has(t.linkedAnimalId) ||
        removedBreedingIds.has(t.linkedBreedingId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    const remove =
      isSameSpecies(l.species, speciesName) &&
      (!isSampleTestingId(l.id) || removedAnimalIds.has(l.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextShows = snapshot.shows
    .filter((s) => {
      const remove = isSameSpecies(s.species, speciesName) && !isSampleTestingId(s.id);
      if (remove) removedTotalRecords++;
      return !remove;
    })
    .map((s) => {
      if (!isSameSpecies(s.species, speciesName)) return s;
      const filteredIds = s.enteredAnimalIds.filter((id) => !removedAnimalIds.has(id));
      if (filteredIds.length === s.enteredAnimalIds.length) return s;
      return { ...s, enteredAnimalIds: filteredIds, updatedAt: ts };
    });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

/**
 * Pure helper: deletes ALL records (animals, photos, cages, breedings, chores, care logs, shows)
 * belonging to `speciesName` while preserving the `SpeciesProfile` schedule and all other species.
 */
export function purgeAllSpeciesRecordsPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const removedAnimalIds = new Set<string>();
  let removedTotalRecords = 0;

  const nextAnimals = snapshot.animals.filter((a) => {
    if (isSameSpecies(a.species, speciesName)) {
      removedAnimalIds.add(a.id);
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    if (isSameSpecies(p.species, speciesName) || removedAnimalIds.has(p.animalId)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextCages = snapshot.cages.filter((c) => {
    if (isSameSpecies(c.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (isSameSpecies(b.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    if (isSameSpecies(t.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    if (isSameSpecies(l.species, speciesName) || removedAnimalIds.has(l.animalId)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextShows = snapshot.shows.filter((s) => {
    if (isSameSpecies(s.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

export interface SpeciesSeedBundle {
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
}

/**
 * Builds a complete 3-generation sample herd, cages, active breeding, cascaded Master Task List
 * chores, weight/show care logs, and upcoming show for any predefined or custom species.
 */
export function buildSampleDataForSpecies(
  speciesName: string,
  speciesProfileOverride?: SpeciesProfile,
  referenceTodayIso?: string
): SpeciesSeedBundle | null {
  const ts = nowIsoUtc();
  const today = referenceTodayIso || todayDateIso();
  const matchedSpec = SPECIES_SEED_SPECS.find((s) => isSameSpecies(s.species, speciesName));
  const matchedPreset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));

  const speciesProfile: SpeciesProfile = speciesProfileOverride
    ? { ...speciesProfileOverride, updatedAt: ts }
    : matchedPreset
    ? { ...matchedPreset, createdAt: ts, updatedAt: ts }
    : resolveSpeciesProfile(speciesName, []);

  const codePrefix = (speciesProfile.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'SP').toUpperCase();
  const spec: SeedFamilySpec = matchedSpec ?? {
    species: speciesProfile.name,
    breed: speciesProfile.exampleBreeds[0] || `Heritage ${speciesProfile.name}`,
    varietyA: 'Chestnut',
    varietyB: 'Black',
    tagPrefix: codePrefix,
    breederName: 'Community Barn',
    cagePrefix: `Pen ${codePrefix}`,
    avgAdultGrams: 5400,
    juniorGrams: 2200,
    names: {
      pgs: `Foundation ${speciesProfile.maleLabel} Atlas`,
      pgd: `Foundation ${speciesProfile.femaleLabel} Willow`,
      mgs: `Outcross ${speciesProfile.maleLabel} Rowan`,
      mgd: `Outcross ${speciesProfile.femaleLabel} Clover`,
      sire: `Herd ${speciesProfile.maleLabel} Cedar`,
      dam: `Herd ${speciesProfile.femaleLabel} Meadow`,
      juniorFemale: `Keeper ${speciesProfile.offspringLabel} Hazel`,
      juniorMale: `Prospect ${speciesProfile.offspringLabel} Birch`,
    },
    showTitle: `${speciesProfile.name} Specialty Club Show`,
    showLocation: 'County Fairgrounds',
    sanctionBody: 'Specialty Club',
    shareGrandsireForLinebreeding: false,
  };

  const slug = spec.species.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const pgsId = seedId(slug, 'pgs');
  const pgdId = seedId(slug, 'pgd');
  const mgsId = spec.shareGrandsireForLinebreeding ? pgsId : seedId(slug, 'mgs');
  const mgdId = seedId(slug, 'mgd');
  const sireId = seedId(slug, 'sire');
  const damId = seedId(slug, 'dam');
  const jrFemaleId = seedId(slug, 'jr-female');
  const jrMaleId = seedId(slug, 'jr-male');

  const makeAnimal = (params: {
    id: string;
    idx: string;
    name: string;
    sex: 'Male' | 'Female';
    status: 'Active' | 'Junior' | 'Retired';
    archived?: boolean;
    daysOld: number;
    weightGrams: number;
    variety: string;
    genoRaw?: string;
    sireId?: string;
    damId?: string;
    cage: string;
    legs: number;
    regSuffix: string;
    notes: string;
  }): Animal => {
    const genoRaw = params.genoRaw || '';
    return {
      id: params.id,
      tattoo: `${spec.tagPrefix}-${params.idx}`,
      name: params.name.trim(),
      species: spec.species,
      breed: spec.breed,
      variety: params.variety,
      sex: params.sex,
      status: params.status,
      archived: Boolean(params.archived),
      birthDateIso: addDaysIso(today, -params.daysOld),
      weightGrams: params.weightGrams,
      genotype: parseGenotypeString(genoRaw),
      genotypeRaw: genoRaw,
      registrationNumber: params.regSuffix ? `REG-${spec.tagPrefix}-${params.regSuffix}` : '',
      grandChampionNumber: params.legs >= 3 ? `GC-${spec.tagPrefix}-${params.idx}` : '',
      legsCount: params.legs,
      cageLocation: params.cage,
      breederName: spec.breederName.trim(),
      ownerName: 'My Barn',
      sireId: params.sireId || '',
      damId: params.damId || '',
      notes: params.notes,
      createdAt: ts,
      updatedAt: ts,
    };
  };

  const animals: Animal[] = [
    makeAnimal({
      id: pgsId,
      idx: '101',
      name: spec.names.pgs,
      sex: 'Male',
      status: 'Retired',
      archived: true,
      daysOld: 1120,
      weightGrams: Math.round(spec.avgAdultGrams * 1.02),
      variety: spec.varietyA,
      genoRaw: spec.genoPgs,
      cage: `${spec.cagePrefix}-01`,
      legs: 4,
      regSuffix: '8810',
      notes: `Foundation ${speciesProfile.maleLabel.toLowerCase()} known for deep type, strong bone, and calm temperament.`,
    }),
    makeAnimal({
      id: pgdId,
      idx: '102',
      name: spec.names.pgd,
      sex: 'Female',
      status: 'Retired',
      archived: true,
      daysOld: 1080,
      weightGrams: Math.round(spec.avgAdultGrams * 1.04),
      variety: spec.varietyA,
      genoRaw: spec.genoPgd,
      cage: `${spec.cagePrefix}-02`,
      legs: 3,
      regSuffix: '8814',
      notes: `Consistent maternal line with strong nursing instincts and even litter weights.`,
    }),
  ];

  if (!spec.shareGrandsireForLinebreeding) {
    animals.push(
      makeAnimal({
        id: mgsId,
        idx: '103',
        name: spec.names.mgs,
        sex: 'Male',
        status: 'Active',
        daysOld: 980,
        weightGrams: Math.round(spec.avgAdultGrams * 1.01),
        variety: spec.varietyB,
        genoRaw: spec.genoMgs,
        cage: `${spec.cagePrefix}-03`,
        legs: 2,
        regSuffix: '8902',
        notes: `Outcross maternal grandsire bringing vigor and topline balance.`,
      })
    );
  }

  animals.push(
    makeAnimal({
      id: mgdId,
      idx: '104',
      name: spec.names.mgd,
      sex: 'Female',
      status: 'Active',
      daysOld: 940,
      weightGrams: Math.round(spec.avgAdultGrams * 1.03),
      variety: spec.varietyB,
      genoRaw: spec.genoMgd,
      cage: `${spec.cagePrefix}-04`,
      legs: 2,
      regSuffix: '8919',
      notes: `Reliable dam line with steady growth curve.`,
    }),
    makeAnimal({
      id: sireId,
      idx: '201',
      name: spec.names.sire,
      sex: 'Male',
      status: 'Active',
      daysOld: 540,
      weightGrams: spec.avgAdultGrams,
      variety: spec.varietyA,
      genoRaw: spec.genoSire,
      sireId: pgsId,
      damId: pgdId,
      cage: `${spec.cagePrefix}-05`,
      legs: 3,
      regSuffix: '9201',
      notes: `Primary herd ${speciesProfile.maleLabel.toLowerCase()} with rich coat and balanced shoulders.`,
    }),
    makeAnimal({
      id: damId,
      idx: '202',
      name: spec.names.dam,
      sex: 'Female',
      status: 'Active',
      daysOld: 510,
      weightGrams: Math.round(spec.avgAdultGrams * 1.05),
      variety: spec.varietyA,
      genoRaw: spec.genoDam,
      sireId: mgsId,
      damId: mgdId,
      cage: `${spec.cagePrefix}-06`,
      legs: 2,
      regSuffix: '9208',
      notes: `Attentive ${speciesProfile.femaleLabel.toLowerCase()} currently bred for upcoming ${speciesProfile.birthEventLabel.toLowerCase()}.`,
    }),
    makeAnimal({
      id: jrFemaleId,
      idx: '301',
      name: spec.names.juniorFemale,
      sex: 'Female',
      status: 'Junior',
      daysOld: 95,
      weightGrams: spec.juniorGrams,
      variety: spec.varietyA,
      genoRaw: spec.genoSubject,
      sireId: sireId,
      damId: damId,
      cage: `${spec.cagePrefix}-07`,
      legs: 1,
      regSuffix: '',
      notes: `Promising keeper ${speciesProfile.offspringLabel.toLowerCase()} retained for show string and replacement stock.`,
    }),
    makeAnimal({
      id: jrMaleId,
      idx: '302',
      name: spec.names.juniorMale,
      sex: 'Male',
      status: 'Junior',
      daysOld: 95,
      weightGrams: Math.round(spec.juniorGrams * 0.98),
      variety: spec.varietyB,
      genoRaw: spec.genoSubject,
      sireId: sireId,
      damId: damId,
      cage: `${spec.cagePrefix}-08`,
      legs: 0,
      regSuffix: '',
      notes: `Growing junior ${speciesProfile.maleLabel.toLowerCase()} prospect from previous litter.`,
    })
  );

  const cages: CageLocation[] = animals.map((a, idx) => ({
    id: seedId(slug, `cage-${idx + 1}`),
    species: spec.species,
    label: a.cageLocation,
    section: idx < 4 ? 'Foundation Row' : idx < 6 ? 'Breeding Row' : 'Grow-Out Row',
    capacity: idx >= 6 ? 2 : 1,
    notes: `Assigned to ${a.name} (${a.tattoo})`,
    createdAt: ts,
    updatedAt: ts,
  }));

  // Extend ancestral lineage with Retired/archived foundation animals so ~half of active
  // animals (jrFemale, jrMale, and sire) carry a complete 6-generation pedigree.
  const herdPrefixes = [
    'Oakridge',
    'Briarwood',
    'Suncrest',
    'Timberline',
    'Cloverdale',
    'Meadowlark',
    'Ironwood',
    'Redwood',
  ];
  const maleAncestorNames = [
    'Sovereign',
    'Cavalier',
    'Brigadier',
    'Vanguard',
    'Monarch',
    'Sterling',
    'Sentinel',
    'Marshal',
    'Ranger',
    'Noble',
    'Champion',
    'Warden',
    'Commodore',
    'Duke',
    'Major',
    'Baron',
  ];
  const femaleAncestorNames = [
    'Duchess',
    'Velvet',
    'Autumn',
    'Garnet',
    'Saffron',
    'Briar',
    'Celeste',
    'Dahlia',
    'Empress',
    'Magnolia',
    'Sorrel',
    'Camellia',
    'Heather',
    'Rosette',
    'Aurora',
    'Verbena',
  ];

  const animalById = new Map(animals.map((a) => [a.id, a]));
  const rabbitAncestorGeno = spec.genoPgs ? 'Aa Bb CC Dd ee ww' : '';

  const attachAncestors = (params: {
    rootId: string;
    branchKey: string;
    branchCode: string;
    depth: number;
  }) => {
    const root = animalById.get(params.rootId);
    if (!root || params.depth <= 0) return;

    const rootBirthDaysAgo =
      params.branchKey === 'pgs'
        ? 1120
        : params.branchKey === 'pgd'
        ? 1080
        : params.branchKey === 'mgs'
        ? 980
        : 940;

    let currentLevelIds: string[] = [root.id];

    for (let level = 1; level <= params.depth; level++) {
      const nextLevelIds: string[] = [];
      const levelDaysOld = rootBirthDaysAgo + level * 540;

      for (let i = 0; i < currentLevelIds.length; i++) {
        const child = animalById.get(currentLevelIds[i])!;
        const sireIdx = i * 2;
        const damIdx = i * 2 + 1;

        const ancSireId = seedId(slug, `anc-${params.branchKey}-l${level}-${sireIdx}`);
        const ancDamId = seedId(slug, `anc-${params.branchKey}-l${level}-${damIdx}`);

        const sirePrefix = herdPrefixes[(level * 3 + sireIdx) % herdPrefixes.length];
        const sireGiven = maleAncestorNames[(level * 5 + sireIdx) % maleAncestorNames.length];
        const damPrefix = herdPrefixes[(level * 3 + damIdx + 2) % herdPrefixes.length];
        const damGiven = femaleAncestorNames[(level * 5 + damIdx) % femaleAncestorNames.length];

        const ancSire = makeAnimal({
          id: ancSireId,
          idx: `${params.branchCode}${level}${String(sireIdx + 1).padStart(2, '0')}`,
          name: `${sirePrefix} ${sireGiven} ${params.branchCode}${level}-${sireIdx + 1}`,
          sex: 'Male',
          status: 'Retired',
          archived: true,
          daysOld: levelDaysOld,
          weightGrams: spec.avgAdultGrams,
          variety: sireIdx % 4 === 0 ? spec.varietyB : spec.varietyA,
          genoRaw: rabbitAncestorGeno,
          cage: '',
          legs: level <= 2 && sireIdx === 0 ? 1 : 0,
          regSuffix: level <= 3 ? `${params.branchCode}${level}${String(sireIdx + 1).padStart(2, '0')}` : '',
          notes: `Archived pedigree ancestor (Gen +${level} from ${root.name}).`,
        });

        const ancDam = makeAnimal({
          id: ancDamId,
          idx: `${params.branchCode}${level}${String(damIdx + 1).padStart(2, '0')}`,
          name: `${damPrefix} ${damGiven} ${params.branchCode}${level}-${damIdx + 1}`,
          sex: 'Female',
          status: 'Retired',
          archived: true,
          daysOld: levelDaysOld - 15,
          weightGrams: Math.round(spec.avgAdultGrams * 1.02),
          variety: damIdx % 4 === 1 ? spec.varietyA : spec.varietyB,
          genoRaw: rabbitAncestorGeno,
          cage: '',
          legs: level === 1 ? 1 : 0,
          regSuffix: level <= 3 ? `${params.branchCode}${level}${String(damIdx + 1).padStart(2, '0')}` : '',
          notes: `Archived pedigree ancestor (Gen +${level} from ${root.name}).`,
        });

        child.sireId = ancSireId;
        child.damId = ancDamId;

        animals.push(ancSire, ancDam);
        animalById.set(ancSireId, ancSire);
        animalById.set(ancDamId, ancDam);

        nextLevelIds.push(ancSireId, ancDamId);
      }

      currentLevelIds = nextLevelIds;
    }
  };

  attachAncestors({ rootId: pgsId, branchKey: 'pgs', branchCode: 'P', depth: 5 });
  attachAncestors({ rootId: pgdId, branchKey: 'pgd', branchCode: 'Q', depth: 5 });
  if (!spec.shareGrandsireForLinebreeding) {
    attachAncestors({ rootId: mgsId, branchKey: 'mgs', branchCode: 'M', depth: 4 });
  }
  attachAncestors({ rootId: mgdId, branchKey: 'mgd', branchCode: 'N', depth: 4 });

  const herdMap = new Map(animals.map((a) => [a.id, a]));
  const sire = herdMap.get(sireId)!;
  const dam = herdMap.get(damId)!;
  const projectedCoi = calculatePairingCoi(sire.id, dam.id, herdMap).coiPercent;

  // Set bred date so expected due date lands within the arriving-babies alert window
  // (e.g. 2 days from today) whenever sample data is built or restored.
  const arrivalLeadDays = Math.min(2, Math.max(0, speciesProfile.gestationDays - 1));
  const bredDaysAgo = Math.max(1, speciesProfile.gestationDays - arrivalLeadDays);
  const bredDateIso = addDaysIso(today, -bredDaysAgo);
  const expectedDueDateIso = addDaysIso(bredDateIso, speciesProfile.gestationDays);

  const activeBreeding: BreedingRecord = {
    id: seedId(slug, 'breeding-active'),
    species: spec.species,
    sireId: sire.id,
    damId: dam.id,
    sireName: sire.name,
    damName: dam.name,
    bredDateIso,
    expectedDueDateIso,
    actualBirthDateIso: '',
    projectedCoiPercent: Math.round(projectedCoi * 100) / 100,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: `Repeat pairing of ${sire.tattoo} × ${dam.tattoo} following strong prior ${speciesProfile.offspringLabel.toLowerCase()} litter.`,
    createdAt: ts,
    updatedAt: ts,
  };

  const cascadedTasks = generateCascadedTasksForBreeding(activeBreeding, speciesProfile).map(
    (task, idx) => ({
      ...task,
      id: seedId(slug, `task-${idx + 1}`),
      completed: task.dueDateIso < today,
    })
  );

  const overdueTask: BarnTask = {
    id: seedId(slug, 'task-overdue'),
    species: spec.species,
    title: `Pre-${speciesProfile.birthEventLabel} Health & Bedding Check: ${dam.name}`,
    category: 'Health',
    priority: 'High',
    dueDateIso: addDaysIso(today, -2),
    linkedAnimalId: dam.id,
    linkedAnimalName: dam.name,
    linkedBreedingId: activeBreeding.id,
    completed: false,
    createdAt: ts,
    updatedAt: ts,
  };

  const tasks: BarnTask[] = [overdueTask, ...cascadedTasks];

  const careLogs: CareLog[] = [
    {
      id: seedId(slug, 'care-1'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -45),
      type: 'Weight Check',
      title: '6-Week Weaning Weight',
      weightGrams: Math.round(spec.juniorGrams * 0.62),
      showLegEarned: false,
      notes: 'Clean transition onto grower ration.',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: seedId(slug, 'care-2'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -20),
      type: 'Weight Check',
      title: '10-Week Growth Check',
      weightGrams: Math.round(spec.juniorGrams * 0.84),
      showLegEarned: false,
      notes: 'Steady topline and rich coat development.',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: seedId(slug, 'care-3'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -3),
      type: 'Weight Check',
      title: 'Current Cage-Side Weight',
      weightGrams: spec.juniorGrams,
      showLegEarned: true,
      notes: 'Earned Best Junior Variety leg at club table show.',
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const shows: ShowEvent[] = [
    {
      id: seedId(slug, 'show-1'),
      species: spec.species,
      name: spec.showTitle,
      location: spec.showLocation,
      sanctioningBody: spec.sanctionBody,
      eventDateIso: addDaysIso(today, 18),
      entryDeadlineIso: addDaysIso(today, 10),
      enteredAnimalIds: [sireId, jrFemaleId],
      notes: `Confirm tattoo legibility and travel carriers before entry deadline.`,
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  return {
    speciesProfile,
    animals,
    cages,
    breedings: [activeBreeding],
    tasks,
    careLogs,
    shows,
  };
}

/**
 * Builds a complete initial `BarnDatabaseSnapshot` seeded with ALL predefined species
 * so every species tab has rich, strictly isolated 3-generation test data out of the box.
 */
export function buildFullPredefinedSampleSnapshot(
  existingSettings?: Partial<BarnSettings>,
  referenceTodayIso?: string
): BarnDatabaseSnapshot {
  const ts = nowIsoUtc();
  const settings: BarnSettings = {
    id: 'barn_settings',
    barnName: existingSettings?.barnName || 'Copper Creek Barn',
    breederName: existingSettings?.breederName || '',
    preferredUnit: existingSettings?.preferredUnit || 'lbs_oz',
    defaultSpecies: existingSettings?.defaultSpecies || 'Rabbit',
    pinnedLandingSpecies: existingSettings?.pinnedLandingSpecies ?? '',
    defaultGenerations: existingSettings?.defaultGenerations || 3,
    themeMode: existingSettings?.themeMode || 'dark',
    customColors: existingSettings?.customColors,
    imageOptimizationPreset: existingSettings?.imageOptimizationPreset || 'balanced',
    showHomeSummaryGrid: existingSettings?.showHomeSummaryGrid ?? true,
    barnNameOnboarded: existingSettings?.barnNameOnboarded ?? false,
    ignoredTaskIds: existingSettings?.ignoredTaskIds ?? [],
    dismissedTaskGroupKeys: existingSettings?.dismissedTaskGroupKeys ?? {},
    dismissedMemoAlertSignatures: existingSettings?.dismissedMemoAlertSignatures ?? {},
    includePhotoOnPedigree: existingSettings?.includePhotoOnPedigree ?? false,
    updatedAt: ts,
  };

  const speciesProfiles: SpeciesProfile[] = [];
  const animals: Animal[] = [];
  const cages: CageLocation[] = [];
  const breedings: BreedingRecord[] = [];
  const tasks: BarnTask[] = [];
  const careLogs: CareLog[] = [];
  const shows: ShowEvent[] = [];

  PREDEFINED_SPECIES_PRESETS.forEach((preset, idx) => {
    const bundle = buildSampleDataForSpecies(preset.name, undefined, referenceTodayIso);
    if (bundle) {
      speciesProfiles.push({ ...bundle.speciesProfile, sortOrder: idx });
      animals.push(...bundle.animals);
      cages.push(...bundle.cages);
      breedings.push(...bundle.breedings);
      tasks.push(...bundle.tasks);
      careLogs.push(...bundle.careLogs);
      shows.push(...bundle.shows);
    }
  });

  return {
    settings,
    speciesProfiles,
    animals,
    animalPhotos: [],
    cages,
    breedings,
    tasks,
    careLogs,
    shows,
  };
}
