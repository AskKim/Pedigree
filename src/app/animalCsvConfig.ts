/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Animal CSV Field Definitions & Schema Mapping Config (`@app/animalCsvConfig.ts`).
 */

import { parseFlexibleWeightToGrams } from '@engine/codecs';
import { type Animal, formatWeight, normalizeAnimalStatus, type WeightUnit } from '../domain/models';
import type { CsvExportSchema } from '@features/csv-exporter';
import {
  type CsvFieldDefinition,
  type CsvSchemaConfig,
  normalizeDateStringIso,
} from '@features/csv-importer';
import {
  normalizeAnimalSex,
  validateAnimalProfile,
} from './animalProfileSchema';

export type AnimalCsvFieldKey =
  | 'name'
  | 'tattoo'
  | 'species'
  | 'breed'
  | 'variety'
  | 'sex'
  | 'status'
  | 'birthDateIso'
  | 'weight'
  | 'weightUnit'
  | 'sireId'
  | 'damId'
  | 'registrationNumber'
  | 'grandChampionNumber'
  | 'legsCount'
  | 'genotypeRaw'
  | 'cageLocation'
  | 'breederName'
  | 'ownerName'
  | 'notes';

export const ANIMAL_CSV_FIELDS: readonly CsvFieldDefinition<AnimalCsvFieldKey>[] = [
  {
    key: 'name',
    label: 'Animal Name',
    aliases: ['name', 'animalname', 'registeredname', 'callname', 'rabbitname', 'goatname'],
  },
  {
    key: 'tattoo',
    label: 'Ear ID / Tattoo / Tag',
    aliases: [
      'tattoo',
      'eartattoo',
      'earid',
      'earnumber',
      'tattooid',
      'eartag',
      'tag',
      'tagnumber',
      'primarytag',
      'animalid',
      'eid',
    ],
  },
  {
    key: 'species',
    label: 'Species',
    aliases: ['species', 'animaltype', 'type', 'livestock'],
  },
  {
    key: 'breed',
    label: 'Breed',
    aliases: ['breed', 'primarybreed'],
  },
  {
    key: 'variety',
    label: 'Variety / Color',
    aliases: ['variety', 'color', 'coatcolor', 'coat', 'markings'],
  },
  {
    key: 'sex',
    label: 'Sex',
    aliases: ['sex', 'gender'],
    normalize: (raw) => normalizeAnimalSex(raw),
  },
  {
    key: 'status',
    label: 'Status',
    aliases: ['status', 'animalstatus', 'state'],
    normalize: (raw) => normalizeAnimalStatus(raw),
  },
  {
    key: 'birthDateIso',
    label: 'Birth Date (DOB)',
    aliases: ['dob', 'birthdate', 'dateofbirth', 'born', 'kindled', 'whelped'],
    normalize: (raw) => {
      const trimmed = raw.trim();
      return trimmed ? normalizeDateStringIso(trimmed) || '__invalid_date__' : '';
    },
    validate: (val) => (val === '__invalid_date__' ? 'Unrecognized birth date format' : null),
  },
  {
    key: 'weight',
    label: 'Weight',
    aliases: ['weight', 'wt', 'weightlbs', 'weightkg', 'currentweight', 'lbs'],
  },
  {
    key: 'weightUnit',
    label: 'Weight Unit',
    aliases: ['weightunit', 'wtunit', 'unit'],
  },
  {
    key: 'sireId',
    label: 'Sire',
    aliases: ['sireid', 'sire', 'sirename', 'siretag', 'father', 'buck', 'ram', 'bull'],
  },
  {
    key: 'damId',
    label: 'Dam',
    aliases: ['damid', 'dam', 'damname', 'damtag', 'mother', 'doe', 'ewe', 'cow'],
  },
  {
    key: 'registrationNumber',
    label: 'Registration No.',
    aliases: ['registrationnumber', 'regnumber', 'regno', 'reg', 'arbareg'],
  },
  {
    key: 'grandChampionNumber',
    label: 'Grand Champion No.',
    aliases: ['grandchampionnumber', 'grandchampionno', 'gcnumber', 'gcno', 'gc'],
  },
  {
    key: 'legsCount',
    label: 'Show Legs',
    aliases: ['legscount', 'legs', 'showlegs'],
    type: 'integer',
    defaultValue: 0,
  },
  {
    key: 'genotypeRaw',
    label: 'Genotype',
    aliases: ['genotyperaw', 'genotype', 'colorcode'],
  },
  {
    key: 'cageLocation',
    label: 'Cage / Pen Location',
    aliases: ['cagelocation', 'cage', 'pen', 'hutch', 'location', 'stall'],
  },
  {
    key: 'breederName',
    label: 'Breeder Name',
    aliases: ['breedername', 'breeder'],
  },
  {
    key: 'ownerName',
    label: 'Owner Name',
    aliases: ['ownername', 'owner'],
  },
  {
    key: 'notes',
    label: 'Notes',
    aliases: ['notes', 'comments', 'remarks', 'memo'],
  },
];

export interface AnimalCsvConfigOptions {
  fallbackSpecies?: string;
  defaultWeightUnit?: string;
}

export function createAnimalCsvSchemaConfig(
  options: AnimalCsvConfigOptions = {}
): CsvSchemaConfig<Animal, AnimalCsvFieldKey> {
  const fallbackSpecies = (options.fallbackSpecies || '').trim() || 'Rabbit';

  return {
    schemaId: 'pedigree-animal-profile-v1',
    fields: ANIMAL_CSV_FIELDS,
    mapRecord(mappedValues) {
      const rawWeight = typeof mappedValues.weight === 'string' ? mappedValues.weight : '';
      const rawUnit =
        typeof mappedValues.weightUnit === 'string' && mappedValues.weightUnit.trim()
          ? mappedValues.weightUnit
          : options.defaultWeightUnit;
      const weightGrams = rawWeight ? parseFlexibleWeightToGrams(rawWeight, rawUnit) : 0;

      const species =
        typeof mappedValues.species === 'string' && mappedValues.species.trim()
          ? mappedValues.species.trim()
          : fallbackSpecies;

      const validated = validateAnimalProfile(
        {
          name: typeof mappedValues.name === 'string' ? mappedValues.name : '',
          tattoo: typeof mappedValues.tattoo === 'string' ? mappedValues.tattoo : '',
          species,
          breed: typeof mappedValues.breed === 'string' ? mappedValues.breed : '',
          variety: typeof mappedValues.variety === 'string' ? mappedValues.variety : '',
          sex: mappedValues.sex as Animal['sex'],
          status: mappedValues.status as Animal['status'],
          birthDateIso:
            typeof mappedValues.birthDateIso === 'string' &&
            mappedValues.birthDateIso !== '__invalid_date__'
              ? mappedValues.birthDateIso
              : '',
          weightGrams,
          sireId: typeof mappedValues.sireId === 'string' ? mappedValues.sireId : '',
          damId: typeof mappedValues.damId === 'string' ? mappedValues.damId : '',
          registrationNumber:
            typeof mappedValues.registrationNumber === 'string'
              ? mappedValues.registrationNumber
              : '',
          grandChampionNumber:
            typeof mappedValues.grandChampionNumber === 'string'
              ? mappedValues.grandChampionNumber
              : '',
          legsCount: typeof mappedValues.legsCount === 'number' ? mappedValues.legsCount : 0,
          genotypeRaw:
            typeof mappedValues.genotypeRaw === 'string' ? mappedValues.genotypeRaw : '',
          cageLocation:
            typeof mappedValues.cageLocation === 'string' ? mappedValues.cageLocation : '',
          breederName:
            typeof mappedValues.breederName === 'string' ? mappedValues.breederName : '',
          ownerName: typeof mappedValues.ownerName === 'string' ? mappedValues.ownerName : '',
          notes: typeof mappedValues.notes === 'string' ? mappedValues.notes : '',
        },
        fallbackSpecies
      );
      return validated.record;
    },
    validateRecord(record) {
      return validateAnimalProfile(record, fallbackSpecies).errors;
    },
  };
}

export function createAnimalCsvExportSchema(options: {
  animalById?: ReadonlyMap<string, Animal>;
  weightUnit?: WeightUnit;
} = {}): CsvExportSchema<Animal> {
  const unit = options.weightUnit || 'lbs_oz';
  const formatParent = (rawId: string) => {
    const clean = (rawId || '').trim();
    if (!clean) return '';
    const parent = options.animalById?.get(clean);
    if (!parent) return clean;
    return parent.tattoo ? `${parent.name} (${parent.tattoo})` : parent.name;
  };

  return {
    schemaId: 'pedigree-animal-profile-export-v1',
    includeBom: true,
    lineEnding: '\r\n',
    columns: [
      { key: 'name', header: 'Animal Name', format: (a) => a.name },
      { key: 'tattoo', header: 'Ear ID / Tattoo / Tag', format: (a) => a.tattoo },
      { key: 'species', header: 'Species', format: (a) => a.species },
      { key: 'breed', header: 'Breed', format: (a) => a.breed },
      { key: 'variety', header: 'Variety / Color', format: (a) => a.variety },
      { key: 'sex', header: 'Sex', format: (a) => a.sex },
      { key: 'status', header: 'Status', format: (a) => a.status },
      { key: 'birthDateIso', header: 'Birth Date (DOB)', format: (a) => a.birthDateIso },
      { key: 'weight', header: 'Weight', format: (a) => (a.weightGrams > 0 ? formatWeight(a.weightGrams, unit) : '') },
      { key: 'sireId', header: 'Sire', format: (a) => formatParent(a.sireId) },
      { key: 'damId', header: 'Dam', format: (a) => formatParent(a.damId) },
      { key: 'registrationNumber', header: 'Registration No.', format: (a) => a.registrationNumber },
      { key: 'grandChampionNumber', header: 'Grand Champion No.', format: (a) => a.grandChampionNumber },
      { key: 'legsCount', header: 'Show Legs', format: (a) => a.legsCount },
      { key: 'genotypeRaw', header: 'Genotype', format: (a) => a.genotypeRaw },
      { key: 'cageLocation', header: 'Cage / Pen Location', format: (a) => a.cageLocation },
      { key: 'breederName', header: 'Breeder Name', format: (a) => a.breederName },
      { key: 'ownerName', header: 'Owner Name', format: (a) => a.ownerName },
      { key: 'notes', header: 'Notes', format: (a) => a.notes },
    ],
  };
}
