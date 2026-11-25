/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Schema-Agnostic CSV Importer Contracts (`@features/csv-importer/types.ts`).
 */

export type CsvFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'enum';

export interface CsvFieldDefinition<TFieldKey extends string = string> {
  readonly key: TFieldKey;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly type?: CsvFieldType;
  readonly required?: boolean;
  readonly enumValues?: readonly string[];
  readonly defaultValue?: unknown;
  readonly normalize?: (rawValue: string, row: Record<string, string>) => unknown;
  readonly validate?: (value: unknown, row: Record<string, string>) => string | null;
}

export interface CsvRecordMapContext {
  readonly rowIndex: number;
  readonly rawRow: Record<string, string>;
  readonly unmappedColumns: Record<string, string>;
}

export interface CsvSchemaConfig<TRecord, TFieldKey extends string = string> {
  readonly schemaId: string;
  readonly fields: readonly CsvFieldDefinition<TFieldKey>[];
  readonly mapRecord: (
    mappedValues: Partial<Record<TFieldKey, unknown>>,
    context: CsvRecordMapContext
  ) => TRecord;
  readonly validateRecord?: (record: TRecord, rowIndex: number) => string[];
  readonly maxRows?: number;
  readonly maxBytes?: number;
}

export type CsvColumnOverrideValue<TFieldKey extends string = string> = TFieldKey | '__ignore__';

export interface CsvColumnMapping<TFieldKey extends string = string> {
  readonly header: string;
  readonly normalizedHeader: string;
  readonly assignedField: TFieldKey | '';
  readonly autoMatchedField: TFieldKey | '';
  readonly isOverride: boolean;
  readonly sampleValues: string[];
}

export interface CsvRowIssue {
  readonly rowIndex: number;
  readonly field?: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface CsvImportOptions<TFieldKey extends string = string> {
  readonly columnOverrides?: Record<string, CsvColumnOverrideValue<TFieldKey>>;
  readonly skipInvalidRows?: boolean;
  readonly dryRun?: boolean;
}

export interface CsvSaveBatchResult {
  readonly savedCount: number;
  readonly skippedCount?: number;
  readonly errors?: string[];
}

export type CsvSaveRecordsCallback<TRecord> = (
  records: TRecord[]
) => Promise<CsvSaveBatchResult | void>;

export interface CsvImportResult<TRecord, TFieldKey extends string = string> {
  readonly ok: boolean;
  readonly schemaId: string;
  readonly headers: string[];
  readonly columns: CsvColumnMapping<TFieldKey>[];
  readonly totalRows: number;
  readonly validRecords: TRecord[];
  readonly issues: CsvRowIssue[];
  readonly savedCount: number;
  readonly skippedRowCount: number;
  readonly dryRun: boolean;
}
