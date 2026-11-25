/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Schema-Agnostic CSV Importer Engine (`@features/csv-importer/csvImporter.ts`).
 */

import type { IFeatureModule } from '../featureModule.interface';
import {
  isSafeHeaderKey,
  normalizeDateStringIso,
  normalizeHeaderKey,
  parseCsvTable,
} from './csvParser';
import type {
  CsvColumnMapping,
  CsvColumnOverrideValue,
  CsvFieldDefinition,
  CsvImportOptions,
  CsvImportResult,
  CsvRowIssue,
  CsvSaveRecordsCallback,
  CsvSchemaConfig,
} from './types';

function buildAliasLookup<TFieldKey extends string>(
  fields: readonly CsvFieldDefinition<TFieldKey>[]
): Map<string, TFieldKey> {
  const lookup = new Map<string, TFieldKey>();
  for (const field of fields) {
    const keyNorm = normalizeHeaderKey(field.key);
    if (keyNorm && !lookup.has(keyNorm)) {
      lookup.set(keyNorm, field.key);
    }
    const labelNorm = normalizeHeaderKey(field.label);
    if (labelNorm && !lookup.has(labelNorm)) {
      lookup.set(labelNorm, field.key);
    }
    for (const alias of field.aliases) {
      const aliasNorm = normalizeHeaderKey(alias);
      if (aliasNorm && !lookup.has(aliasNorm)) {
        lookup.set(aliasNorm, field.key);
      }
    }
  }
  return lookup;
}

/**
 * Matches table headers against schema field aliases and generates column mapping descriptors.
 *
 * @param headers List of detected header strings from CSV
 * @param rows Preview row samples for auto-mapping inspection
 * @param fields Schema field definitions with aliases
 * @param overrides Optional user-specified manual column overrides
 * @returns Array of CsvColumnMapping objects
 */
export function resolveColumnMappings<TFieldKey extends string>(
  headers: string[],
  rows: Array<Record<string, string>>,
  fields: readonly CsvFieldDefinition<TFieldKey>[],
  overrides?: Record<string, CsvColumnOverrideValue<TFieldKey>>
): CsvColumnMapping<TFieldKey>[] {
  const aliasLookup = buildAliasLookup(fields);
  const validFieldKeys = new Set<string>(fields.map((f) => f.key));

  return headers.map((header) => {
    const normalizedHeader = normalizeHeaderKey(header);
    const autoMatchedField = aliasLookup.get(normalizedHeader) ?? '';
    const override = overrides?.[header];

    let assignedField: TFieldKey | '' = autoMatchedField;
    let isOverride = false;

    if (override === '__ignore__') {
      assignedField = '';
      isOverride = true;
    } else if (override && validFieldKeys.has(override)) {
      assignedField = override;
      isOverride = override !== autoMatchedField;
    }

    const sampleValues: string[] = [];
    if (isSafeHeaderKey(header)) {
      for (let i = 0; i < rows.length && sampleValues.length < 3; i += 1) {
        const val = (rows[i]?.[header] || '').trim();
        if (val && !sampleValues.includes(val)) {
          sampleValues.push(val.slice(0, 64));
        }
      }
    }

    return {
      header,
      normalizedHeader,
      assignedField,
      autoMatchedField,
      isOverride,
      sampleValues,
    };
  });
}

function coerceFieldValue<TFieldKey extends string>(
  rawValue: string,
  field: CsvFieldDefinition<TFieldKey>,
  rawRow: Record<string, string>
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (field.normalize) {
    return { ok: true, value: field.normalize(rawValue, rawRow) };
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return { ok: true, value: field.defaultValue ?? '' };
  }

  switch (field.type) {
    case 'number': {
      const n = Number(trimmed.replace(/,/g, ''));
      if (!Number.isFinite(n)) {
        return { ok: false, error: `Field "${field.label}" expects a valid number` };
      }
      return { ok: true, value: n };
    }
    case 'integer': {
      const n = Number(trimmed.replace(/,/g, ''));
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, error: `Field "${field.label}" expects an integer` };
      }
      return { ok: true, value: n };
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'y') {
        return { ok: true, value: true };
      }
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'n') {
        return { ok: true, value: false };
      }
      return { ok: false, error: `Field "${field.label}" expects a boolean value` };
    }
    case 'date': {
      const iso = normalizeDateStringIso(trimmed);
      if (!iso) {
        return { ok: false, error: `Field "${field.label}" has an unrecognized date format` };
      }
      return { ok: true, value: iso };
    }
    case 'enum': {
      if (field.enumValues && field.enumValues.length > 0) {
        const match = field.enumValues.find((v) => v.toLowerCase() === trimmed.toLowerCase());
        if (!match) {
          return {
            ok: false,
            error: `Field "${field.label}" must be one of: ${field.enumValues.join(', ')}`,
          };
        }
        return { ok: true, value: match };
      }
      return { ok: true, value: trimmed };
    }
    default:
      return { ok: true, value: trimmed };
  }
}

/**
 * Parses delimited text, resolves column mappings, and validates rows against a schema without committing.
 *
 * @param input Raw CSV/TSV text string or binary byte array
 * @param schema Field definitions, type coercion, and validation rules
 * @param options Column overrides, dryRun, and maxRows limit
 * @returns Parsed result containing mapped validRecords, issues, and column metadata
 */
export function parseAndValidateCsv<TRecord, TFieldKey extends string = string>(
  input: string | Uint8Array,
  schema: CsvSchemaConfig<TRecord, TFieldKey>,
  options: CsvImportOptions<TFieldKey> = {}
): Omit<CsvImportResult<TRecord, TFieldKey>, 'savedCount'> {
  const table = parseCsvTable(input, {
    maxBytes: schema.maxBytes,
    maxRows: schema.maxRows,
  });
  const columns = resolveColumnMappings(
    table.headers,
    table.rows,
    schema.fields,
    options.columnOverrides
  );

  const fieldByKey = new Map<TFieldKey, CsvFieldDefinition<TFieldKey>>();
  for (const field of schema.fields) {
    fieldByKey.set(field.key, field);
  }

  const headerToField = new Map<string, TFieldKey>();
  const unmappedHeaders: string[] = [];
  for (const col of columns) {
    if (col.assignedField) {
      headerToField.set(col.header, col.assignedField);
    } else {
      unmappedHeaders.push(col.header);
    }
  }

  const validRecords: TRecord[] = [];
  const issues: CsvRowIssue[] = [];
  let skippedRowCount = 0;

  table.rows.forEach((rawRow, idx) => {
    const rowIndex = idx + 1;
    const mappedValues: Partial<Record<TFieldKey, unknown>> = Object.create(null);
    const rowErrors: CsvRowIssue[] = [];

    for (const [header, fieldKey] of headerToField.entries()) {
      const field = fieldByKey.get(fieldKey);
      if (!field) continue;
      if (mappedValues[fieldKey] !== undefined && mappedValues[fieldKey] !== '') {
        continue;
      }

      const rawCell = rawRow[header] ?? '';
      const coerced = coerceFieldValue(rawCell, field, rawRow);
      if (!coerced.ok) {
        rowErrors.push({
          rowIndex,
          field: field.key,
          severity: 'error',
          message: coerced.error,
        });
        continue;
      }

      if (field.validate) {
        const validationError = field.validate(coerced.value, rawRow);
        if (validationError) {
          rowErrors.push({
            rowIndex,
            field: field.key,
            severity: 'error',
            message: validationError,
          });
          continue;
        }
      }

      mappedValues[fieldKey] = coerced.value;
    }

    for (const field of schema.fields) {
      const val = mappedValues[field.key];
      const isMissing = val === undefined || val === null || val === '';
      if (isMissing && field.defaultValue !== undefined) {
        mappedValues[field.key] = field.defaultValue;
      } else if (isMissing && field.required) {
        rowErrors.push({
          rowIndex,
          field: field.key,
          severity: 'error',
          message: `Required field "${field.label}" is missing`,
        });
      }
    }

    const unmappedColumns: Record<string, string> = Object.create(null);
    for (const header of unmappedHeaders) {
      const val = rawRow[header];
      if (val) {
        unmappedColumns[header] = val;
      }
    }

    const candidate = schema.mapRecord(mappedValues, {
      rowIndex,
      rawRow,
      unmappedColumns,
    });

    if (schema.validateRecord) {
      const recordErrors = schema.validateRecord(candidate, rowIndex);
      for (const msg of recordErrors) {
        rowErrors.push({
          rowIndex,
          severity: 'error',
          message: msg,
        });
      }
    }

    if (rowErrors.length > 0) {
      issues.push(...rowErrors);
      skippedRowCount += 1;
    } else {
      validRecords.push(candidate);
    }
  });

  const skipInvalid = options.skipInvalidRows !== false;
  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return {
    ok: skipInvalid ? validRecords.length > 0 || table.rows.length === 0 : !hasErrors,
    schemaId: schema.schemaId,
    headers: table.headers,
    columns,
    totalRows: table.rows.length,
    validRecords: !skipInvalid && hasErrors ? [] : validRecords,
    issues,
    skippedRowCount,
    dryRun: Boolean(options.dryRun),
  };
}

/**
 * Executes a full CSV import workflow: parses, maps columns, validates rows, and persists valid records via callback.
 *
 * @param input Raw CSV/TSV text or byte array
 * @param schema Schema config defining fields and validation
 * @param saveRecords Callback persisting validated records into the backing database/store
 * @param options Import options (column overrides, dryRun, maxRows)
 * @returns Final CsvImportResult with saved count, skipped count, and issues
 */
export async function runCsvImport<TRecord, TFieldKey extends string = string>(
  input: string | Uint8Array,
  schema: CsvSchemaConfig<TRecord, TFieldKey>,
  saveRecords: CsvSaveRecordsCallback<TRecord>,
  options: CsvImportOptions<TFieldKey> = {}
): Promise<CsvImportResult<TRecord, TFieldKey>> {
  const parsed = parseAndValidateCsv(input, schema, options);
  if (options.dryRun || parsed.validRecords.length === 0 || !parsed.ok) {
    return {
      ...parsed,
      savedCount: 0,
    };
  }

  const saveOutcome = await saveRecords(parsed.validRecords);
  const savedCount =
    saveOutcome && typeof saveOutcome.savedCount === 'number'
      ? saveOutcome.savedCount
      : parsed.validRecords.length;
  const extraErrors: CsvRowIssue[] =
    saveOutcome?.errors?.map((msg) => ({
      rowIndex: 0,
      severity: 'error',
      message: msg,
    })) ?? [];

  return {
    ...parsed,
    ok: parsed.ok && extraErrors.length === 0,
    issues: [...parsed.issues, ...extraErrors],
    savedCount,
    skippedRowCount: parsed.skippedRowCount + (saveOutcome?.skippedCount ?? 0),
  };
}

export function createCsvImporterFeatureModule<
  TRecord,
  TFieldKey extends string = string
>(): IFeatureModule<{ schemaId?: string }, { ready: boolean; lastSchemaId?: string }> {
  let ready = false;
  let lastSchemaId: string | undefined;

  return {
    metadata: {
      id: 'csv-importer',
      name: 'Schema-Agnostic CSV Importer',
      version: '1.0.0',
      description: 'Reusable delimited table parser, column mapper, and validated batch importer.',
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
