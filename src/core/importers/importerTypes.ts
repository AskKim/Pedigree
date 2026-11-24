/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular External Platform Importer Interfaces (`src/core/importers/importerTypes.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 * Accepts raw `Uint8Array` archive buffers so the exact same importer modules run in Web/PWA
 * and React Native / Expo (`expo-document-picker` + `expo-file-system`).
 */

import {
  Animal,
  BarnDatabaseSnapshot,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ShowEvent,
  SpeciesProfile,
} from '../models';
import type { AnimalImportConflict } from './conflictResolver';

export interface RawArchiveInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface VirtualArchiveEntry {
  archiveName: string;
  entryPath: string;
  baseName: string;
  extension: string;
  sizeBytes: number;
  textContent?: string;
  imageBytes?: Uint8Array;
  mimeHint?: string;
  isMediaOrBinary: boolean;
}

export interface StagedImportedPhoto {
  id: string;
  species: string;
  animalId: string;
  animalName: string;
  isPrimary: boolean;
  sortOrder: number;
  caption: string;
  originalFileName: string;
  entryPath: string;
  mimeHint: string;
  bytes: Uint8Array;
}

export type ImportedTableClassification =
  | 'animals'
  | 'pedigree_links'
  | 'breedings'
  | 'weights'
  | 'treatments_care'
  | 'notes_tasks'
  | 'cages_groups'
  | 'shows'
  | 'media_manifest'
  | 'media_deferred'
  | 'metadata_other';

export interface DetectedTableDiagnostic {
  archiveName: string;
  entryPath: string;
  classification: ImportedTableClassification;
  rowCount: number;
  headers: string[];
  matchedColumns: string[];
  unmappedColumns: string[];
}

export interface CustomSpeciesImportOverride {
  gestationDays?: number;
  weanDaysAfterBirth?: number;
  rebreedDaysAfterBirth?: number;
  maleLabel?: string;
  femaleLabel?: string;
  offspringLabel?: string;
  birthEventLabel?: string;
}

export type CsvTargetFieldKey =
  | 'name'
  | 'tattoo'
  | 'species'
  | 'sex'
  | 'birthDateIso'
  | 'breed'
  | 'variety'
  | 'weight'
  | 'weightUnit'
  | 'sire'
  | 'dam'
  | 'pgs'
  | 'pgd'
  | 'mgs'
  | 'mgd'
  | 'sss'
  | 'ssd'
  | 'sds'
  | 'sdd'
  | 'dss'
  | 'dsd'
  | 'dds'
  | 'ddd'
  | 'registrationNumber'
  | 'grandChampionNumber'
  | 'legsCount'
  | 'genotypeRaw'
  | 'status'
  | 'cageLocation'
  | 'breederName'
  | 'ownerName'
  | 'notes';

export type CsvColumnMappingSelection = CsvTargetFieldKey | '__ignore__';

export interface CsvColumnPreviewItem {
  header: string;
  normalizedKey: string;
  assignedField: CsvTargetFieldKey | '';
  autoMatchedField: CsvTargetFieldKey | '';
  isUserOverride: boolean;
  sampleValues: string[];
}

export interface CsvTableMappingSummary {
  archiveName: string;
  entryPath: string;
  rowCount: number;
  columns: CsvColumnPreviewItem[];
}

export interface UnresolvedParentLink {
  entryPath: string;
  rowNumber: number;
  childAnimalId: string;
  childName: string;
  childTattoo: string;
  species: string;
  role: 'sire' | 'dam';
  rawReference: string;
  placeholderCreated: boolean;
  placeholderAnimalId?: string;
}

export interface ImporterRunOptions {
  /**
   * Used when an external platform exports single-species CSVs that omit an explicit `Species` column.
   */
  fallbackSpeciesName: string;
  /**
   * Optional user-customized schedule overrides for non-predefined species brought in during import,
   * keyed by lowercase species name.
   */
  customSpeciesOverrides?: Record<string, CustomSpeciesImportOverride>;
  /**
   * Optional plain-text breadcrumb: when true, appends detected photo filenames to `animal.notes`
   * without storing binary images or adding photo schema fields.
   */
  appendDeferredImageFilenamesToNotes?: boolean;
  /**
   * Optional interactive spreadsheet column mapping overrides keyed by `${entryPath}::${header}`
   * or `${header}`. Set value to `'__ignore__'` to explicitly leave an auto-matched column unmapped.
   */
  csvColumnMapping?: Record<string, CsvColumnMappingSelection>;
  /**
   * When true (default), unresolved Gen 1 Sire/Dam links in non-HerdBoss CSVs synthesize a
   * placeholder ancestor animal record; when false, those parent IDs remain unlinked.
   */
  createPlaceholderAncestorsForUnlinked?: boolean;
}

export interface PlatformImportPreview {
  platformId: string;
  platformName: string;
  archiveNames: string[];
  diagnostics: DetectedTableDiagnostic[];
  stagedPhotos: StagedImportedPhoto[];
  stagedPhotosRawBytes: number;
  missingPhotoZipRefsCount: number;
  deferredMediaCount: number;
  deferredMediaBytes: number;
  deferredMediaSampleNames: string[];
  deferredManifestRowCount: number;
  animalsWithMultipleImagesCount: number;
  warnings: string[];
  speciesDetected: string[];
  newSpeciesProfiles: SpeciesProfile[];
  animals: Animal[];
  matchedExistingAnimalsCount: number;
  conflicts: AnimalImportConflict[];
  parentLinksResolved: number;
  placeholderAncestorsCreated: number;
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
  /**
   * Per-table CSV/TSV column mapping breakdown (headers, matched vs unmapped, sample values)
   * for interactive spreadsheet column mapping previews.
   */
  csvTables?: CsvTableMappingSummary[];
  /**
   * Pre-import highlight list of Gen 1 Sire/Dam references on non-HerdBoss CSV imports
   * that did not match any animal row in the spreadsheet or preexisting barn herd.
   */
  unresolvedParentLinks?: UnresolvedParentLink[];
  /**
   * Privacy-safe manifest of filenames, row counts, and column headers (zero breeder PII)
   * so users can inspect or share exact export structure for QA tuning.
   */
  schemaDiagnosticReport: string;
}

export interface PlatformImporter {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly supportsMultiZip: boolean;
  readonly acceptedExtensions: string[];
  readonly summary: string;
  readonly instructions: string;
  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview;
}
