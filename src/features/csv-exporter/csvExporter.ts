/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Schema-Agnostic CSV Exporter Engine (`@features/csv-exporter/csvExporter.ts`).
 *
 * Pure TypeScript RFC-4180 CSV serializer with UTF-8 BOM and formula-injection sanitization.
 * Zero domain terms, zero DOM dependencies, zero cross-feature imports.
 */

import { utf8StringToBytes } from '@engine/binaryEncoding';
import { CSV_UTF8_BOM, escapeCsvCellWithLimit } from '@engine/codecs/textFormats';
import { slugifySegment } from '@engine/primitives';
import type { IFeatureModule } from '../featureModule.interface';
import type {
  CsvExportOptions,
  CsvExportOutput,
  CsvExportSchema,
} from './types';

export { CSV_UTF8_BOM };

/** Feature-level cell cap (higher than the Alpha 2 domain default). */
const FEATURE_CSV_CELL_MAX_LENGTH = 32_000;

/**
 * Escapes a single CSV cell (RFC-4180 + formula-injection protection) via the shared engine encoder.
 */
export function escapeCsvCell(value: unknown): string {
  return escapeCsvCellWithLimit(value, FEATURE_CSV_CELL_MAX_LENGTH);
}

/**
 * Builds a deterministic, URL- and filename-safe CSV export filename with a date slug.
 *
 * @param prefix Leading domain or entity slug (e.g. 'records')
 * @param segment Optional sub-category or filter segment
 * @param dateSlug Optional ISO date string (defaults to today's UTC date)
 * @returns Clean filename string ending in .csv
 */
export function buildDatedCsvFilename(
  prefix: string,
  segment?: string,
  dateSlug?: string
): string {
  const baseSlug = slugifySegment(prefix, 'data');
  const stamp = slugifySegment(dateSlug || new Date().toISOString().slice(0, 10), 'export');
  if (segment && segment.trim()) {
    return `${baseSlug}-${slugifySegment(segment, 'subset')}-export-${stamp}.csv`;
  }
  return `${baseSlug}-export-${stamp}.csv`;
}

/**
 * Serializes typed records into an RFC-4180 CSV output package with optional UTF-8 BOM.
 *
 * @param records Readonly array of records to export
 * @param schema Column definitions, formatters, and line-ending configuration
 * @param options Export overrides (filename, date slug, subset segment)
 * @returns CsvExportOutput containing filename, csvText, binary bytes, and recordCount
 */
export function exportRecordsToCsv<TRecord>(
  records: readonly TRecord[],
  schema: CsvExportSchema<TRecord>,
  options: CsvExportOptions = {}
): CsvExportOutput {
  const lineEnding = schema.lineEnding ?? '\r\n';
  const includeBom = schema.includeBom !== false;

  const headerLine = schema.columns.map((col) => escapeCsvCell(col.header)).join(',');
  const dataLines = records.map((record) =>
    schema.columns.map((col) => escapeCsvCell(col.format(record))).join(',')
  );

  const body = [headerLine, ...dataLines].join(lineEnding);
  const csvText = includeBom ? `${CSV_UTF8_BOM}${body}` : body;

  return {
    schemaId: schema.schemaId,
    filename: buildDatedCsvFilename(
      options.filePrefix || schema.schemaId,
      options.segment,
      options.dateSlug
    ),
    csvText,
    bytes: utf8StringToBytes(csvText),
    rowCount: records.length,
    columnCount: schema.columns.length,
  };
}

export function createCsvExporterFeatureModule(): IFeatureModule<
  { schemaId?: string },
  { ready: boolean; lastSchemaId?: string }
> {
  let ready = false;
  let lastSchemaId: string | undefined;

  return {
    metadata: {
      id: 'csv-exporter',
      name: 'Schema-Agnostic CSV Exporter',
      version: '1.0.0',
      description: 'Reusable RFC-4180 tabular exporter with UTF-8 BOM and formula-cell sanitization.',
    },
    async initialize(context) {
      lastSchemaId = context.config?.schemaId;
      ready = true;
    },
    async dispose() {
      ready = false;
    },
    getStateSnapshot() {
      return { ready, lastSchemaId };
    },
  };
}
