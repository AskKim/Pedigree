/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Schema-Agnostic CSV Exporter Contracts (`@features/csv-exporter/types.ts`).
 */

export interface CsvExportColumn<TRecord> {
  readonly key: string;
  readonly header: string;
  readonly format: (record: TRecord) => unknown;
}

export interface CsvExportSchema<TRecord> {
  readonly schemaId: string;
  readonly columns: readonly CsvExportColumn<TRecord>[];
  readonly includeBom?: boolean;
  readonly lineEnding?: '\r\n' | '\n';
}

export interface CsvExportOptions {
  readonly filePrefix?: string;
  readonly segment?: string;
  readonly dateSlug?: string;
}

export interface CsvExportOutput {
  readonly schemaId: string;
  readonly filename: string;
  readonly csvText: string;
  readonly bytes: Uint8Array;
  readonly rowCount: number;
  readonly columnCount: number;
}
