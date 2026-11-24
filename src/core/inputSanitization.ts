/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Input Sanitization, File Size Guardrails & ZIP-Bomb / Injection Defense.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript + `fflate` Uint8Array helpers with zero browser DOM (`window`, `document`)
 * dependencies so the exact same validation and sanitization layer runs identically in
 * Web PWAs, unit tests, and React Native / Expo.
 */

import { unzipSync } from 'fflate';
import type { SyncEntityType, SyncOperation } from './syncOutbox';
import type { CustomThemeColors } from './themePalette';

// ============================================================================
// Rational File & Payload Size Limits
// ============================================================================

export const MAX_PHOTO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB per image file
export const MAX_PHOTO_BATCH_COUNT = 50; // Max images in one direct pick/drop batch
export const MAX_IMAGE_PIXEL_DIMENSION = 16_384; // Max single axis pixel count
export const MAX_IMAGE_TOTAL_PIXELS = 100_000_000; // 100 MP canvas bomb limit

export const MAX_JSON_BACKUP_BYTES = 150 * 1024 * 1024; // 150 MB standalone JSON backup
export const MAX_DELTA_JSON_BYTES = 50 * 1024 * 1024; // 50 MB single delta JSON file
export const MAX_DELTA_BATCH_FILES = 50; // Max peer delta files per upload/sync pass
export const MAX_DELTA_BATCH_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB combined delta batch
export const MAX_DELTA_OPERATIONS = 100_000; // Max operations accepted in one merge

export const MAX_ZIP_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MB single .ZIP file
export const MAX_EXTERNAL_IMPORT_FILES = 20; // Max staged files in External Importer
export const MAX_EXTERNAL_IMPORT_TOTAL_BYTES = 300 * 1024 * 1024; // 300 MB staged total

export const MAX_ZIP_ENTRY_BYTES = 150 * 1024 * 1024; // 150 MB single decompressed ZIP entry
export const MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES = 400 * 1024 * 1024; // 400 MB total decompressed bytes
export const MAX_ZIP_ENTRY_COUNT = 5_000; // Max entries in one archive

export const MAX_CSV_TEXT_BYTES = 50 * 1024 * 1024; // 50 MB decoded CSV/TSV/JSON text table
export const MAX_CSV_ROWS = 200_000; // Pathological CSV row cap
export const MAX_SQLITE_DB_BYTES = 250 * 1024 * 1024; // 250 MB raw SQLite binary

const SQLITE_HEADER_MAGIC = 'SQLite format 3\0';

const ALLOWED_CUSTOM_COLOR_KEYS: ReadonlyArray<keyof CustomThemeColors> = [
  'lightPrimary',
  'lightAccent',
  'lightMale',
  'lightCanvas',
  'lightSurface',
  'darkPrimary',
  'darkAccent',
  'darkMale',
  'darkCanvas',
  'darkSurface',
];

const DANGEROUS_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function formatReadableByteLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

/**
 * Validates that an uploaded file has a non-empty, finite byte size and does not
 * exceed a rational upper ceiling before the browser reads/decodes it into memory.
 */
export function validateUploadFileSize(
  fileName: string,
  byteSize: number,
  maxBytes: number,
  kindLabel: string
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'selected file', 180) || 'selected file';
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return {
      ok: false,
      error: `Could not read "${safeName}": invalid file size reported.`,
    };
  }
  if (byteSize === 0) {
    return {
      ok: false,
      error: `File "${safeName}" is empty (0 bytes) and cannot be imported.`,
    };
  }
  if (byteSize > maxBytes) {
    return {
      ok: false,
      error: `File "${safeName}" is ${formatReadableByteLimit(byteSize)}, which exceeds the rational ${formatReadableByteLimit(maxBytes)} limit for ${kindLabel}. Check that you selected the intended file.`,
    };
  }
  return { ok: true };
}

/**
 * Verifies SQLite binary bounds and the mandatory 16-byte `"SQLite format 3\0"` file signature
 * before handing bytes to the WebAssembly SQLite engine.
 */
export function validateSqliteFileHeader(
  bytes: Uint8Array,
  fileName = 'database.sqlite'
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'database.sqlite', 180) || 'database.sqlite';
  const sizeCheck = validateUploadFileSize(safeName, bytes.byteLength, MAX_SQLITE_DB_BYTES, 'a SQLite database');
  if (!sizeCheck.ok) return sizeCheck;

  if (bytes.byteLength < 100) {
    return {
      ok: false,
      error: `File "${safeName}" is too small (${bytes.byteLength} bytes) to be a valid SQLite database.`,
    };
  }

  for (let i = 0; i < SQLITE_HEADER_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_HEADER_MAGIC.charCodeAt(i)) {
      return {
        ok: false,
        error: `File "${safeName}" does not have a valid SQLite 3 database header. Select a .sqlite or .db file exported by this app.`,
      };
    }
  }

  return { ok: true };
}

export interface SafeUnzipOptions {
  archiveName?: string;
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
  entryFilter?: (entryPath: string) => boolean;
}

/**
 * Safely unpacks a `.zip` archive while enforcing entry count, single-entry size, and
 * cumulative decompressed byte limits BEFORE and AFTER inflating entries to stop ZIP bombs.
 */
export function safeUnzipArchive(
  bytes: Uint8Array,
  options: SafeUnzipOptions = {}
): Record<string, Uint8Array> {
  const archiveName = sanitizeSingleLineText(options.archiveName || 'archive.zip', 180) || 'archive.zip';
  const maxArchiveBytes = options.maxArchiveBytes ?? MAX_ZIP_ARCHIVE_BYTES;
  const maxEntries = options.maxEntries ?? MAX_ZIP_ENTRY_COUNT;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ZIP_ENTRY_BYTES;
  const maxTotalUncompressedBytes =
    options.maxTotalUncompressedBytes ?? MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES;
  const entryFilter = options.entryFilter;

  const sizeCheck = validateUploadFileSize(
    archiveName,
    bytes.byteLength,
    maxArchiveBytes,
    'a ZIP archive'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  let entryCount = 0;
  let declaredTotalBytes = 0;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter(file) {
        entryCount++;
        if (entryCount > maxEntries) {
          throw new Error(
            `ZIP archive "${archiveName}" contains more than ${maxEntries.toLocaleString()} entries and was rejected to prevent resource exhaustion.`
          );
        }
        const declaredSize = Number(file.originalSize) || 0;
        if (declaredSize > maxEntryBytes) {
          throw new Error(
            `Entry "${sanitizeSingleLineText(file.name, 120)}" inside "${archiveName}" expands to ${formatReadableByteLimit(declaredSize)}, exceeding the ${formatReadableByteLimit(maxEntryBytes)} per-file limit.`
          );
        }
        declaredTotalBytes += declaredSize;
        if (declaredTotalBytes > maxTotalUncompressedBytes) {
          throw new Error(
            `ZIP archive "${archiveName}" expands beyond the ${formatReadableByteLimit(maxTotalUncompressedBytes)} safety limit.`
          );
        }
        return entryFilter ? Boolean(entryFilter(file.name)) : true;
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('limit') || err.message.includes('entries'))
    ) {
      throw err;
    }
    throw new Error(
      `Could not open ZIP archive "${archiveName}". Ensure the file is a valid, uncorrupted .zip archive.`
    );
  }

  let actualTotalBytes = 0;
  const sanitizedMap: Record<string, Uint8Array> = Object.create(null);
  for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
    if (!isSafeRecordKey(entryPath)) continue;
    if (entryBytes.byteLength > maxEntryBytes) {
      throw new Error(
        `Entry "${sanitizeSingleLineText(entryPath, 120)}" inside "${archiveName}" exceeds the ${formatReadableByteLimit(maxEntryBytes)} decompressed file limit.`
      );
    }
    actualTotalBytes += entryBytes.byteLength;
    if (actualTotalBytes > maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP archive "${archiveName}" decompressed to more than ${formatReadableByteLimit(maxTotalUncompressedBytes)} and was rejected.`
      );
    }
    sanitizedMap[entryPath] = entryBytes;
  }

  return sanitizedMap;
}

/**
 * Strips NUL bytes, unsafe C0/C1 control characters (preserving `\t`, `\n`, `\r`),
 * Trojan-Source bidirectional overrides, and unpaired UTF-16 surrogates, while keeping valid emojis.
 */
export function sanitizePlainText(value: unknown, maxLen = 20_000): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  let out = '';

  for (let i = 0; i < raw.length && out.length < maxLen; i++) {
    const code = raw.charCodeAt(i);

    // Preserve valid surrogate pairs (emojis / supplementary plane characters)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < raw.length) {
        const low = raw.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          if (out.length + 2 > maxLen) break;
          out += raw[i] + raw[i + 1];
          i++;
        }
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      // Unpaired low surrogate
      continue;
    }

    // Strip NUL and C0 controls except \t (0x09), \n (0x0A), \r (0x0D)
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      continue;
    }
    // Strip DEL and C1 controls
    if (code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      continue;
    }
    // Strip Unicode bidirectional control overrides/isolates
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      continue;
    }

    out += raw[i];
  }

  return out;
}

/**
 * Sanitizes single-line text fields (names, tattoos, breeds, IDs, labels) by removing control
 * characters and converting embedded line breaks/tabs into spaces.
 */
export function sanitizeSingleLineText(value: unknown, maxLen = 500): string {
  return sanitizePlainText(value, maxLen)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Strictly validates that an image URL is a base64 raster data URI (`png`, `jpeg`, `webp`,
 * `gif`, `avif`, `bmp`). Blocks `image/svg+xml`, `javascript:`, HTML quotes, and oversized strings.
 */
export function sanitizeSafeRasterImageDataUrl(
  value: unknown,
  maxChars = 15_000_000
): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return '';
  const match = trimmed.match(
    /^data:image\/(png|jpe?g|pjpeg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) return '';
  const subtype = match[1].toLowerCase() === 'pjpeg' ? 'jpeg' : match[1].toLowerCase();
  const cleanPayload = match[2].replace(/\s+/g, '');
  if (!cleanPayload) return '';
  return `data:image/${subtype};base64,${cleanPayload}`;
}

/**
 * Detects SVG images by MIME type, filename extension, or leading `<svg` markup so they
 * cannot smuggle executable XML/script payloads through image upload fields.
 */
export function isSvgImageInput(
  mimeType: string | undefined,
  fileName: string | undefined,
  bytesPrefix?: Uint8Array
): boolean {
  if (mimeType && /svg/i.test(mimeType)) return true;
  if (fileName && /\.svgz?$/i.test(fileName.trim())) return true;
  if (bytesPrefix && bytesPrefix.length > 0) {
    const headLen = Math.min(bytesPrefix.length, 512);
    let head = '';
    for (let i = 0; i < headLen; i++) {
      const ch = bytesPrefix[i];
      if (ch === 0) break;
      head += String.fromCharCode(ch);
    }
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return true;
  }
  return false;
}

/**
 * Validates that a CSS color value is strictly a 6-digit `#RRGGBB` hex string.
 */
export function sanitizeCssHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/**
 * Filters a user/imported custom theme palette down to the exact allowed `CustomThemeColors`
 * keys with validated `#RRGGBB` hex colors.
 */
export function sanitizeCustomColors(raw: unknown): CustomThemeColors | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const clean: CustomThemeColors = {};
  let hasAny = false;

  for (const key of ALLOWED_CUSTOM_COLOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const validHex = sanitizeCssHexColor(src[key]);
    if (validHex) {
      clean[key] = validHex;
      hasAny = true;
    }
  }
  return hasAny ? clean : undefined;
}

/**
 * Neutralizes spreadsheet formula injection (CSV Injection) on cells whose first character
 * or trimmed-start character triggers formula evaluation (`=`, `+`, `-`, `@`, `\t`, `\r`),
 * while preserving legitimate purely negative numeric values like `-12.5`.
 */
export function sanitizeCsvFormulaCell(rawText: string): string {
  if (!rawText) return '';
  if (/^\s*-\d+(?:\.\d+)?\s*$/.test(rawText)) {
    return rawText;
  }
  const firstChar = rawText[0];
  const trimmedFirst = rawText.trimStart()[0];
  if (
    firstChar === '=' ||
    firstChar === '+' ||
    firstChar === '-' ||
    firstChar === '@' ||
    firstChar === '\t' ||
    firstChar === '\r' ||
    trimmedFirst === '=' ||
    trimmedFirst === '+' ||
    trimmedFirst === '-' ||
    trimmedFirst === '@'
  ) {
    return `'${rawText}`;
  }
  return rawText;
}

/**
 * Escapes all HTML meta-characters including single quotes (`&#39;`).
 */
export function escapeSafeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates that an external website URL uses strictly `https://` or `http://` (blocking
 * `javascript:`, `data:`, `vbscript:`, etc.) for safe HTML `<a href>` rendering.
 */
export function sanitizeSafeExternalHttpUrl(raw: unknown, maxLen = 400): string {
  const clean = sanitizeSingleLineText(raw, maxLen);
  if (!clean) return '';
  if (/^(?:javascript|data|vbscript|file):/i.test(clean)) return '';
  const withScheme = /^https?:\/\//i.test(clean)
    ? clean
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(clean)
    ? `https://${clean}`
    : '';
  if (!withScheme) return '';
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(withScheme)) return '';
  return withScheme;
}

/**
 * Returns `false` for prototype-polluting object keys (`__proto__`, `constructor`, `prototype`).
 */
export function isSafeRecordKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && !DANGEROUS_RECORD_KEYS.has(key);
}

/**
 * Copies plain JSON object string/string[] dictionaries safely without inheriting or
 * mutating prototype chains.
 */
export function sanitizePlainDictionary<T>(
  raw: unknown,
  coerceValue: (val: unknown) => T | undefined,
  maxEntries = 500
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= maxEntries) break;
    if (!isSafeRecordKey(k)) continue;
    const coerced = coerceValue(v);
    if (coerced !== undefined) {
      out[k] = coerced;
      count++;
    }
  }
  return out;
}

const VALID_SYNC_ENTITY_TYPES = new Set<SyncEntityType>([
  'animal',
  'breeding',
  'task',
  'careLog',
  'show',
  'cage',
  'species',
  'settings',
  'photo',
  'feedBatch',
  'feedAllocation',
  'ledgerEntry',
  'processingLog',
  'youthProjectBook',
  'clientContact',
  'waitlistEntry',
  'animalReservation',
  'woolHarvest',
  'mileageLog',
  'journalEntry',
  'judgeClub',
  'judgeAssignment',
  'judgeExpense',
]);

export const ALLOWED_SYNC_FIELDS_BY_ENTITY: Record<SyncEntityType, ReadonlySet<string>> = {
  animal: new Set([
    'tattoo',
    'name',
    'species',
    'breed',
    'variety',
    'sex',
    'status',
    'archived',
    'needsAttention',
    'ignoredConflicts',
    'birthDateIso',
    'weightGrams',
    'genotype',
    'genotypeRaw',
    'rufusLevel',
    'suspectedCarrierOf',
    'confirmedCarrierOf',
    'clearedCarrierOf',
    'registrationNumber',
    'grandChampionNumber',
    'legsCount',
    'cageLocation',
    'breederName',
    'ownerName',
    'ownershipType',
    'culled',
    'cullDateIso',
    'cullReason',
    'deceasedDateIso',
    'deathCause',
    'soldDateIso',
    'salePriceCents',
    'purchaseCostCents',
    'buyerName',
    'forSale',
    'askingPriceCents',
    'saleNotes',
    'sireId',
    'damId',
    'notes',
    '_rev',
  ]),
  breeding: new Set([
    'species',
    'sireId',
    'damId',
    'sireName',
    'damName',
    'bredDateIso',
    'expectedDueDateIso',
    'actualBirthDateIso',
    'projectedCoiPercent',
    'liveCount',
    'stillbornCount',
    'fosteredCount',
    'weanedCount',
    'offspringCreated',
    'status',
    'serviceFeeCents',
    'serviceFeeDirection',
    'ultrasoundDateIso',
    'ultrasoundResult',
    'ultrasoundFetalCount',
    'ultrasoundProjectedDueIso',
    'notes',
    '_rev',
  ]),
  task: new Set([
    'species',
    'title',
    'category',
    'priority',
    'startDateIso',
    'dueDateIso',
    'linkedAnimalId',
    'linkedAnimalName',
    'linkedBreedingId',
    'completed',
    '_rev',
  ]),
  careLog: new Set([
    'species',
    'animalId',
    'dateIso',
    'type',
    'title',
    'weightGrams',
    'showLegEarned',
    'medicationName',
    'dosage',
    'administrationRoute',
    'withdrawalDays',
    'withdrawalClearDateIso',
    'bodyConditionScore',
    'famachaScore',
    'fecalEggCount',
    'ultrasoundResult',
    'ultrasoundFetalCount',
    'notes',
    '_rev',
  ]),
  show: new Set([
    'species',
    'name',
    'location',
    'sanctioningBody',
    'eventDateIso',
    'entryDeadlineIso',
    'enteredAnimalIds',
    'notes',
    '_rev',
  ]),
  cage: new Set(['species', 'label', 'section', 'capacity', 'notes', '_rev']),
  species: new Set([
    'name',
    'sortOrder',
    'defaultAnimalPrefix',
    'preferredUnit',
    'memoText',
    'memoUpdatedAt',
    'gestationDays',
    'rebreedDaysAfterBirth',
    'weanDaysAfterBirth',
    'maturityDays',
    'birthEventLabel',
    'maleLabel',
    'femaleLabel',
    'offspringLabel',
    'exampleBreeds',
    'milestones',
    '_rev',
  ]),
  settings: new Set([
    'barnName',
    'breederName',
    'preferredUnit',
    'currencyCode',
    'defaultSpecies',
    'pinnedLandingSpecies',
    'defaultGenerations',
    'themeMode',
    'customColors',
    'imageOptimizationPreset',
    'showHomeSummaryGrid',
    'barnNameOnboarded',
    'ignoredTaskIds',
    'dismissedTaskGroupKeys',
    'dismissedMemoAlertSignatures',
    'speciesHubBlockOrder',
    'includePhotoOnPedigree',
    'breederLogoDataUrl',
    'breederEmail',
    'breederPhone',
    'breederLocation',
    'breederWebsite',
    'showcaseTagline',
    'calendarSync',
    'weatherForecast',
    'enableJudgeNotebook',
    '_rev',
  ]),
  photo: new Set([
    'species',
    'animalId',
    'isPrimary',
    'sortOrder',
    'caption',
    'originalFileName',
    'mimeType',
    'width',
    'height',
    'originalBytes',
    'storedBytes',
    'thumbnailDataUrl',
    'dataUrl',
    '_rev',
  ]),
  feedBatch: new Set([
    'species',
    'brand',
    'productName',
    'lotNumber',
    'millCode',
    'manufactureDateIso',
    'purchaseDateIso',
    'bagCount',
    'bagWeightValue',
    'bagWeightUnit',
    'totalQuantity',
    'remainingQuantity',
    'lowStockThreshold',
    'totalCostCents',
    'supplierName',
    'proteinPercent',
    'notes',
    'tagPhotoDataUrl',
    'tagPhotoThumbnailDataUrl',
    'tagPhotoMimeType',
    'tagPhotoBytes',
    'tagPhotoCapturedDateIso',
    'tagPhotoPurgedAtIso',
    'tagPhotoBytesReclaimed',
    'ocrRawText',
    'ocrConfidence',
    'ocrManualOverride',
    'recallFlagged',
    'recallNote',
    '_rev',
  ]),
  feedAllocation: new Set([
    'species',
    'feedBatchId',
    'targetType',
    'targetId',
    'targetLabel',
    'dateIso',
    'quantity',
    'unit',
    'notes',
    '_rev',
  ]),
  ledgerEntry: new Set([
    'species',
    'dateIso',
    'entryType',
    'category',
    'amountCents',
    'title',
    'vendorOrParty',
    'linkedAnimalId',
    'linkedBreedingId',
    'linkedFeedBatchId',
    'linkedProjectId',
    'receiptPhotoDataUrl',
    'receiptPhotoThumbnailDataUrl',
    'receiptPhotoMimeType',
    'receiptPhotoBytes',
    'notes',
    '_rev',
  ]),
  processingLog: new Set([
    'species',
    'title',
    'linkedAnimalId',
    'linkedBreedingId',
    'scheduledDateIso',
    'harvestDateIso',
    'status',
    'animalCount',
    'liveWeightGrams',
    'dressedWeightGrams',
    'dressOutPercent',
    'peltCount',
    'peltGrade',
    'peltColorNotes',
    'processingCostCents',
    'meatValueCents',
    'peltValueCents',
    'notes',
    '_rev',
  ]),
  youthProjectBook: new Set([
    'species',
    'organization',
    'projectTitle',
    'memberName',
    'clubOrChapter',
    'leaderOrAdvisor',
    'projectYear',
    'startDateIso',
    'endDateIso',
    'status',
    'linkedAnimalIds',
    'linkedBreedingIds',
    'startingInventoryValueCents',
    'endingInventoryValueCents',
    'feedLogs',
    'goalsAndReflection',
    'showAndCommunityNotes',
    'notes',
    '_rev',
  ]),
  clientContact: new Set([
    'species',
    'fullName',
    'ranchOrHerdName',
    'email',
    'phone',
    'preferredContact',
    'clientKind',
    'cityState',
    'shippingAddress',
    'tags',
    'notes',
    '_rev',
  ]),
  waitlistEntry: new Set([
    'species',
    'clientId',
    'clientName',
    'priorityRank',
    'status',
    'intent',
    'desiredBreed',
    'desiredVariety',
    'preferredSex',
    'preferredBreedingId',
    'requestedByDateIso',
    'inquiryDateIso',
    'followUpDateIso',
    'lastContactedDateIso',
    'maxBudgetCents',
    'notes',
    '_rev',
  ]),
  animalReservation: new Set([
    'species',
    'agreementNumber',
    'clientId',
    'clientName',
    'waitlistEntryId',
    'animalId',
    'breedingId',
    'pickOrder',
    'itemLabel',
    'status',
    'reservedDateIso',
    'holdExpiresDateIso',
    'totalPriceCents',
    'depositRequiredCents',
    'depositPaidCents',
    'depositDueDateIso',
    'depositPaidDateIso',
    'pickupScheduledDateIso',
    'completedDateIso',
    'balanceReminderDateIso',
    'paymentMethod',
    'ledgerEntryId',
    'termsSummary',
    'healthGuaranteeNotes',
    'notes',
    '_rev',
  ]),
  woolHarvest: new Set([
    'species',
    'animalId',
    'harvestDateIso',
    'shearingIntervalDays',
    'primeWeightGrams',
    'gradeWeightGrams',
    'harvestMethod',
    'stapleLengthMm',
    'iagarbScore',
    'witnessedBy',
    'notes',
    '_rev',
  ]),
  mileageLog: new Set([
    'species',
    'dateIso',
    'purpose',
    'origin',
    'destination',
    'roundTrip',
    'miles',
    'odometerStart',
    'odometerEnd',
    'rateCentsPerMile',
    'parkingAndTollsCents',
    'linkedShowId',
    'linkedClientId',
    'vehicleLabel',
    'taxDeductible',
    'notes',
    '_rev',
  ]),
  journalEntry: new Set([
    'species',
    'entryDateIso',
    'title',
    'body',
    'colorCategory',
    'starRating',
    'tags',
    'pinned',
    'linkedAnimalIds',
    '_rev',
  ]),
  judgeClub: new Set([
    'species',
    'clubName',
    'sanctioningBody',
    'contactPerson',
    'roleTitle',
    'email',
    'phone',
    'cityState',
    'venueName',
    'notes',
    '_rev',
  ]),
  judgeAssignment: new Set([
    'species',
    'showName',
    'clubId',
    'clubName',
    'sanctioningBody',
    'showDateIso',
    'endDateIso',
    'location',
    'venueAddress',
    'assignmentRole',
    'breedsAssigned',
    'bidStatus',
    'bidSubmittedDateIso',
    'bidResponseDueIso',
    'contractStatus',
    'contractNumber',
    'contractSignedDateIso',
    'judgingFeeCents',
    'perDiemCents',
    'hotelProvided',
    'mileageReimbursementRateCents',
    'estimatedMiles',
    'actualMiles',
    'linkedMileageLogId',
    'feePaid',
    'feePaidDateIso',
    'contractTermsSummary',
    'notes',
    '_rev',
  ]),
  judgeExpense: new Set([
    'species',
    'assignmentId',
    'dateIso',
    'category',
    'description',
    'vendor',
    'amountCents',
    'reimbursable',
    'reimbursed',
    'reimbursedDateIso',
    'taxDeductible',
    'notes',
    '_rev',
  ]),
};

/**
 * Validates that an incoming `SyncOperation` has valid entity types, safe field names
 * (preventing `__proto__`/prototype injection or arbitrary properties), and well-typed metadata.
 */
export function isValidSyncOperation(op: unknown): op is SyncOperation {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return false;
  const candidate = op as Record<string, unknown>;
  if (typeof candidate.op_id !== 'string' || !candidate.op_id.trim()) return false;
  if (typeof candidate.entity_type !== 'string' || !VALID_SYNC_ENTITY_TYPES.has(candidate.entity_type as SyncEntityType)) {
    return false;
  }
  if (typeof candidate.entity_uuid !== 'string' || !candidate.entity_uuid.trim()) return false;
  if (typeof candidate.device_id !== 'string' || !candidate.device_id.trim()) return false;
  if (typeof candidate.timestamp !== 'string' || !candidate.timestamp.trim()) return false;
  if (typeof candidate.logical_counter !== 'number' || !Number.isFinite(candidate.logical_counter)) {
    return false;
  }
  if (
    candidate.record_rev !== undefined &&
    (typeof candidate.record_rev !== 'number' ||
      !Number.isFinite(candidate.record_rev) ||
      candidate.record_rev < 0)
  ) {
    return false;
  }
  const field = candidate.field_name;
  if (!isSafeRecordKey(field)) return false;
  if (field === '__create__' || field === '__delete__') {
    if (field === '__create__') {
      if (!candidate.new_value || typeof candidate.new_value !== 'object' || Array.isArray(candidate.new_value)) {
        return false;
      }
    }
    return true;
  }
  return ALLOWED_SYNC_FIELDS_BY_ENTITY[candidate.entity_type as SyncEntityType].has(field);
}
