/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Lightweight Application Configuration Constant (`@app/pedigreeAppConfig.ts`).
 * Kept separate from storage/archive wiring so hooks reading metadata never pull
 * ZIP or SQLite WASM engines into the initial boot chunk.
 */

import type { AppMetadataConfig, IAppConfiguration } from './appConfig.interface';
import { createDefaultAppMetadata } from './appConfig.interface';

/**
 * Immutable baseline application metadata for Community Pedigree.
 */
export const DEFAULT_APP_METADATA: AppMetadataConfig = createDefaultAppMetadata();

/**
 * Returns the application metadata descriptor.
 */
export function getAppMetadata(): AppMetadataConfig {
  return DEFAULT_APP_METADATA;
}

/**
 * Returns the current application version string.
 */
export function getAppVersion(): string {
  return DEFAULT_APP_METADATA.appVersion;
}

/**
 * Returns the human-readable display name of the application.
 */
export function getAppName(): string {
  return DEFAULT_APP_METADATA.appName;
}

export const PEDIGREE_APP_CONFIG: IAppConfiguration = {
  metadata: DEFAULT_APP_METADATA,
  activeSpeciesId: 'rabbit',
  supportedSpecies: [
    'rabbit',
    'goat',
    'sheep',
    'cavy',
    'poultry',
    'cattle',
    'horse',
    'swine',
    'dog',
    'cat',
  ],
  terminology: {
    rabbit: {
      singularAnimal: 'Rabbit',
      pluralAnimal: 'Rabbits',
      sireLabel: 'Buck',
      damLabel: 'Doe',
      offspringGroupLabel: 'Litter',
      birthEventLabel: 'Kindling',
      identificationLabel: 'Tattoo',
    },
    goat: {
      singularAnimal: 'Goat',
      pluralAnimal: 'Goats',
      sireLabel: 'Buck',
      damLabel: 'Doe',
      offspringGroupLabel: 'Kids',
      birthEventLabel: 'Kidding',
      identificationLabel: 'Tag / Tattoo',
    },
  },
  features: [
    { featureId: 'csv-importer', enabled: true },
    { featureId: 'csv-exporter', enabled: true },
    { featureId: 'backup-vault', enabled: true },
    { featureId: 'document-export', enabled: true },
    { featureId: 'ics-calendar', enabled: true },
    { featureId: 'ocr-parser', enabled: true },
  ],
};
