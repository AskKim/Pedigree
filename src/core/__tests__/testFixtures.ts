import {
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  PREDEFINED_SPECIES_PRESETS,
  SpeciesProfile,
} from '../models';

const TS = '2026-01-15T12:00:00.000Z';

export function makeSpeciesProfile(name: string): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (preset) {
    return { ...preset, createdAt: TS, updatedAt: TS };
  }
  return {
    id: `species-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    gestationDays: 31,
    rebreedDaysAfterBirth: 21,
    weanDaysAfterBirth: 42,
    birthEventLabel: 'Kindling',
    maleLabel: 'Buck',
    femaleLabel: 'Doe',
    offspringLabel: 'Kit',
    exampleBreeds: ['New Zealand'],
    milestones: [],
    createdAt: TS,
    updatedAt: TS,
  };
}

export function makeSettings(overrides: Partial<BarnSettings> = {}): BarnSettings {
  return {
    id: 'default',
    barnName: 'Meadowbrook Rabbitry',
    breederName: 'Breeder',
    preferredUnit: 'lbs_oz',
    defaultSpecies: 'Rabbit',
    pinnedLandingSpecies: '',
    defaultGenerations: 3,
    themeMode: 'light',
    updatedAt: TS,
    ...overrides,
  };
}

export function makeAnimal(
  id: string,
  overrides: Partial<Animal> = {}
): Animal {
  return {
    id,
    tattoo: id.toUpperCase(),
    name: overrides.name ?? `Animal ${id}`,
    species: 'Rabbit',
    breed: 'New Zealand',
    variety: 'Red',
    sex: 'Unknown',
    status: 'Active',
    birthDateIso: '2025-01-01',
    weightGrams: 4000,
    genotype: [],
    genotypeRaw: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Breeder',
    ownerName: 'Owner',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

export function makeEmptySnapshot(overrides: Partial<BarnDatabaseSnapshot> = {}): BarnDatabaseSnapshot {
  return {
    settings: makeSettings(),
    speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
    animals: [],
    animalPhotos: [],
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    ...overrides,
  };
}
