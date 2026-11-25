/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Interactive CSV Column Mapper (`src/domain/importers/csvColumnMapper.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 */

import { isSafeRecordKey, sanitizeSingleLineText } from '../inputSanitization';
import { normalizeColumnKey } from './archiveAndCsvUtils';
import type {
  CsvColumnMappingSelection,
  CsvColumnPreviewItem,
  CsvTargetFieldKey,
} from './importerTypes';

export interface CsvTargetFieldOption {
  key: CsvTargetFieldKey;
  label: string;
  group: 'identity' | 'pedigree' | 'details';
  aliases: string[];
}

export const CSV_TARGET_FIELD_OPTIONS: readonly CsvTargetFieldOption[] = [
  {
    key: 'name',
    label: 'Animal Name',
    group: 'identity',
    aliases: ['name', 'animalname', 'registeredname', 'callname', 'rabbitname', 'goatname', 'animal'],
  },
  {
    key: 'tattoo',
    label: 'Ear ID / Tattoo / Tag',
    group: 'identity',
    aliases: [
      'earid',
      'earnumber',
      'tattoo',
      'tattooid',
      'eartattoo',
      'eartag',
      'primarytag',
      'tag',
      'tagnumber',
      'id',
      'animalid',
      'eid',
    ],
  },
  {
    key: 'sex',
    label: 'Sex / Gender',
    group: 'identity',
    aliases: ['sex', 'gender'],
  },
  {
    key: 'birthDateIso',
    label: 'Birth Date (DOB)',
    group: 'identity',
    aliases: ['dob', 'birthdate', 'dateofbirth', 'born', 'whelped', 'kindled'],
  },
  {
    key: 'species',
    label: 'Species',
    group: 'identity',
    aliases: ['species', 'animaltype', 'type', 'livestock'],
  },
  {
    key: 'breed',
    label: 'Breed',
    group: 'identity',
    aliases: ['breed', 'primarybreed'],
  },
  {
    key: 'variety',
    label: 'Variety / Color',
    group: 'identity',
    aliases: ['variety', 'color', 'coatcolor', 'coat', 'markings'],
  },
  {
    key: 'weight',
    label: 'Weight',
    group: 'details',
    aliases: ['weight', 'wt', 'weightlbs', 'weightkg', 'currentweight', 'lbs'],
  },
  {
    key: 'weightUnit',
    label: 'Weight Unit',
    group: 'details',
    aliases: ['weightunit', 'wtunit', 'unit'],
  },
  {
    key: 'sire',
    label: 'Sire (Father / Buck)',
    group: 'pedigree',
    aliases: [
      'sireid',
      'siretattooid',
      'sire',
      'sirename',
      'siretag',
      'father',
      'fatherid',
      'fathername',
      'buck',
      'ram',
      'bull',
      'stallion',
      'stud',
    ],
  },
  {
    key: 'dam',
    label: 'Dam (Mother / Doe)',
    group: 'pedigree',
    aliases: [
      'damid',
      'damtattooid',
      'dam',
      'damname',
      'damtag',
      'mother',
      'motherid',
      'mothername',
      'doe',
      'ewe',
      'cow',
      'mare',
    ],
  },
  {
    key: 'pgs',
    label: 'Paternal Grandsire (PGS)',
    group: 'pedigree',
    aliases: ['pgs', 'siresire', 'siressire', 'paternalgrandsire', 'fatherfather', 'fathersfather', 'ss', 'ff', 'g2s1'],
  },
  {
    key: 'pgd',
    label: 'Paternal Granddam (PGD)',
    group: 'pedigree',
    aliases: ['pgd', 'siredam', 'siresdam', 'paternalgranddam', 'fathermother', 'fathersmother', 'sd', 'fm', 'g2d1'],
  },
  {
    key: 'mgs',
    label: 'Maternal Grandsire (MGS)',
    group: 'pedigree',
    aliases: ['mgs', 'damsire', 'damssire', 'maternalgrandsire', 'motherfather', 'mothersfather', 'ds', 'mf', 'g2s2'],
  },
  {
    key: 'mgd',
    label: 'Maternal Granddam (MGD)',
    group: 'pedigree',
    aliases: ['mgd', 'damdam', 'damsdam', 'maternalgranddam', 'mothermother', 'mothersmother', 'dd', 'mm', 'g2d2'],
  },
  {
    key: 'sss',
    label: "Sire's Paternal Grandsire (SSS)",
    group: 'pedigree',
    aliases: ['sss', 'fff', 'pgssire', 'siresiresire'],
  },
  {
    key: 'ssd',
    label: "Sire's Paternal Granddam (SSD)",
    group: 'pedigree',
    aliases: ['ssd', 'ffm', 'pgsdam', 'siresiredam'],
  },
  {
    key: 'sds',
    label: "Sire's Maternal Grandsire (SDS)",
    group: 'pedigree',
    aliases: ['sds', 'fmf', 'pgdsire', 'siredamsire'],
  },
  {
    key: 'sdd',
    label: "Sire's Maternal Granddam (SDD)",
    group: 'pedigree',
    aliases: ['sdd', 'fmm', 'pgddam', 'siredamdam'],
  },
  {
    key: 'dss',
    label: "Dam's Paternal Grandsire (DSS)",
    group: 'pedigree',
    aliases: ['dss', 'mff', 'mgssire', 'damsiresire'],
  },
  {
    key: 'dsd',
    label: "Dam's Paternal Granddam (DSD)",
    group: 'pedigree',
    aliases: ['dsd', 'mfm', 'mgsdam', 'damsiredam'],
  },
  {
    key: 'dds',
    label: "Dam's Maternal Grandsire (DDS)",
    group: 'pedigree',
    aliases: ['dds', 'mmf', 'mgdsire', 'damdamsire'],
  },
  {
    key: 'ddd',
    label: "Dam's Maternal Granddam (DDD)",
    group: 'pedigree',
    aliases: ['ddd', 'mmm', 'mgddam', 'damdamdam'],
  },
  {
    key: 'registrationNumber',
    label: 'Registration No.',
    group: 'details',
    aliases: ['registrationnumber', 'regnumber', 'regno', 'reg', 'arbareg'],
  },
  {
    key: 'grandChampionNumber',
    label: 'Grand Champion No.',
    group: 'details',
    aliases: ['grandchampionnumber', 'grandchampionno', 'gcnumber', 'gcno', 'gc'],
  },
  {
    key: 'legsCount',
    label: 'Show Legs',
    group: 'details',
    aliases: ['legs', 'legscount', 'showlegs'],
  },
  {
    key: 'genotypeRaw',
    label: 'Genotype / Color Code',
    group: 'details',
    aliases: ['genotype', 'genotyperaw', 'colorcode'],
  },
  {
    key: 'status',
    label: 'Status (Active / Archived / Sold)',
    group: 'details',
    aliases: ['status', 'animalstatus', 'state'],
  },
  {
    key: 'cageLocation',
    label: 'Cage / Pen Location',
    group: 'details',
    aliases: ['cagelocation', 'cage', 'pen', 'hutch', 'location', 'stall'],
  },
  {
    key: 'breederName',
    label: 'Breeder Name',
    group: 'details',
    aliases: ['breeder', 'breedername'],
  },
  {
    key: 'ownerName',
    label: 'Owner Name',
    group: 'details',
    aliases: ['owner', 'ownername'],
  },
  {
    key: 'notes',
    label: 'Notes / Comments',
    group: 'details',
    aliases: ['notes', 'comments', 'remarks', 'memo'],
  },
];

const ALIAS_TO_FIELD_MAP: Map<string, { field: CsvTargetFieldKey; priority: number }> = (() => {
  const map = new Map<string, { field: CsvTargetFieldKey; priority: number }>();
  for (const spec of CSV_TARGET_FIELD_OPTIONS) {
    spec.aliases.forEach((alias, idx) => {
      if (!map.has(alias)) {
        map.set(alias, { field: spec.key, priority: idx });
      }
    });
  }
  return map;
})();

export function makeCsvColumnOverrideKey(entryPath: string, header: string): string {
  return `${entryPath}::${header}`;
}

export function autoMatchCsvHeader(header: string): CsvTargetFieldKey | '' {
  const nk = normalizeColumnKey(header);
  if (!nk) return '';
  return ALIAS_TO_FIELD_MAP.get(nk)?.field || '';
}

export interface CsvTableColumnResolution {
  columns: CsvColumnPreviewItem[];
  headersByField: Map<CsvTargetFieldKey, string[]>;
  matchedColumns: string[];
  unmappedColumns: string[];
}

export function resolveCsvColumnAssignments(
  headers: string[],
  rows: Array<Record<string, string>>,
  customMapping?: Record<string, CsvColumnMappingSelection>,
  entryPath?: string
): CsvTableColumnResolution {
  const columns: CsvColumnPreviewItem[] = [];
  const headersByField = new Map<CsvTargetFieldKey, string[]>();

  for (const header of headers) {
    const normalizedKey = normalizeColumnKey(header);
    const autoMatchedField = autoMatchCsvHeader(header);

    const scopedKey = entryPath ? makeCsvColumnOverrideKey(entryPath, header) : '';
    const override =
      (scopedKey && customMapping?.[scopedKey]) || customMapping?.[header] || undefined;

    let assignedField: CsvTargetFieldKey | '' = autoMatchedField;
    let isUserOverride = false;
    if (override === '__ignore__') {
      assignedField = '';
      isUserOverride = true;
    } else if (override) {
      assignedField = override;
      isUserOverride = override !== autoMatchedField;
    }

    const sampleValues: string[] = [];
    if (isSafeRecordKey(header)) {
      for (let i = 0; i < rows.length && sampleValues.length < 3; i++) {
        const raw = (rows[i]?.[header] || '').trim();
        if (!raw) continue;
        const cleanSample = sanitizeSingleLineText(raw, 48);
        if (cleanSample && !sampleValues.includes(cleanSample)) {
          sampleValues.push(cleanSample);
        }
      }
    }

    columns.push({
      header,
      normalizedKey,
      assignedField,
      autoMatchedField,
      isUserOverride,
      sampleValues,
    });

    if (assignedField) {
      const existing = headersByField.get(assignedField) || [];
      existing.push(header);
      headersByField.set(assignedField, existing);
    }
  }

  // Sort headers per field so user overrides come first, then earlier alias priority
  for (const [field, fieldHeaders] of headersByField.entries()) {
    if (fieldHeaders.length <= 1) continue;
    const spec = CSV_TARGET_FIELD_OPTIONS.find((opt) => opt.key === field);
    const aliasOrder = spec?.aliases || [];
    fieldHeaders.sort((a, b) => {
      const colA = columns.find((c) => c.header === a);
      const colB = columns.find((c) => c.header === b);
      const ovA = colA?.isUserOverride ? 0 : 1;
      const ovB = colB?.isUserOverride ? 0 : 1;
      if (ovA !== ovB) return ovA - ovB;
      const idxA = aliasOrder.indexOf(normalizeColumnKey(a));
      const idxB = aliasOrder.indexOf(normalizeColumnKey(b));
      const rankA = idxA === -1 ? 999 : idxA;
      const rankB = idxB === -1 ? 999 : idxB;
      return rankA - rankB;
    });
  }

  const matchedColumns = columns.filter((c) => c.assignedField !== '').map((c) => c.header);
  const unmappedColumns = columns.filter((c) => c.assignedField === '').map((c) => c.header);

  return {
    columns,
    headersByField,
    matchedColumns,
    unmappedColumns,
  };
}
