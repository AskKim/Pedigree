/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Starter CSV Template Generator (`src/core/importers/csvStarterTemplate.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM dependencies.
 */

import { escapeCsvCell, UTF8_BOM } from '../csvExport';
import { resolveSpeciesProfile, SpeciesProfile } from '../models';

export const STARTER_CSV_TEMPLATE_HEADERS = [
  'Name',
  'Ear_ID',
  'Sex',
  'DOB',
  'Breed',
  'Variety',
  'Weight',
  'Sire_ID',
  'Dam_ID',
  'Reg_No',
  'GC_No',
  'Species',
  'Genotype',
  'Legs',
  'Notes',
] as const;

export interface StarterCsvTemplateResult {
  filename: string;
  content: string;
  headers: readonly string[];
}

function slugifyTemplatePart(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'livestock'
  );
}

/**
 * Generates an RFC-4180 UTF-8 BOM starter CSV template with standard pedigree headers
 * (`Name, Ear_ID, Sex, DOB, Breed, Variety, Weight, Sire_ID, Dam_ID, Reg_No, GC_No`, plus
 * `Species, Genotype, Legs, Notes`) and 3 linked example rows ready for Excel or Google Sheets.
 */
export function buildStarterCsvTemplate(
  speciesName?: string,
  speciesProfiles: SpeciesProfile[] = []
): StarterCsvTemplateResult {
  const cleanSpecies = (speciesName || '').trim() || 'Rabbit';
  const profile = resolveSpeciesProfile(cleanSpecies, speciesProfiles);
  const sampleBreed = profile.exampleBreeds[0] || 'Heritage Line';
  const maleSex = profile.maleLabel || 'Male';
  const femaleSex = profile.femaleLabel || 'Female';

  const isRabbit = profile.name.toLowerCase() === 'rabbit';
  const isCavy = profile.name.toLowerCase() === 'guinea pig';
  const sampleWeightSire = isRabbit ? '9 lb 4 oz' : isCavy ? '2.4 lbs' : '145 lbs';
  const sampleWeightDam = isRabbit ? '8 lb 12 oz' : isCavy ? '2.1 lbs' : '128 lbs';
  const sampleWeightOffspring = isRabbit ? '6 lb 8 oz' : isCavy ? '1.6 lbs' : '64 lbs';
  const sampleGeno = isRabbit ? 'Aa B_ C_ Dd Ee' : '';

  const rows: string[][] = [
    [
      'Oakridge Thunder',
      'OR-101',
      maleSex,
      '2023-04-12',
      sampleBreed,
      'Chestnut',
      sampleWeightSire,
      '',
      '',
      'REG-1042',
      'GC-881',
      profile.name,
      sampleGeno,
      '3',
      'Example sire row (overwrite or delete before final import)',
    ],
    [
      'Oakridge Clover',
      'OR-102',
      femaleSex,
      '2023-06-05',
      sampleBreed,
      'Broken Black',
      sampleWeightDam,
      '',
      '',
      'REG-1098',
      '',
      profile.name,
      sampleGeno,
      '1',
      'Example dam row (overwrite or delete before final import)',
    ],
    [
      'Oakridge Willow',
      'OR-205',
      femaleSex,
      '2025-02-18',
      sampleBreed,
      'Chestnut',
      sampleWeightOffspring,
      'OR-101',
      'OR-102',
      '',
      '',
      profile.name,
      sampleGeno,
      '0',
      'Example offspring referencing Sire_ID OR-101 and Dam_ID OR-102',
    ],
  ];

  const lines = [
    STARTER_CSV_TEMPLATE_HEADERS.join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  const filename =
    cleanSpecies.toLowerCase() === 'rabbit'
      ? 'community-pedigree-starter-template.csv'
      : `community-pedigree-${slugifyTemplatePart(cleanSpecies)}-template.csv`;

  return {
    filename,
    content: `${UTF8_BOM}${lines.join('\r\n')}`,
    headers: STARTER_CSV_TEMPLATE_HEADERS,
  };
}
