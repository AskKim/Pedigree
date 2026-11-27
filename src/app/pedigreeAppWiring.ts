/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Application Layer Wiring: Core Storage + Platform Bridge + Decoupled Feature Modules
 * (`@app/pedigreeAppWiring.ts`).
 */

import {
  createPlatformBridge,
  type IPlatformBridge,
  type PlatformBridgeOptions,
} from '@engine/bridge';
import type { Animal, BarnTask, WeightUnit } from '../domain/models';
import {
  buildQueryDeepLink,
  decodeGenericP2pSignalToken,
  encodeGenericP2pSignalToken,
  evaluateGenericWorkloadForTier,
  getGenericHeavyZipExportGate,
  renderQrSvg,
  tryExtractGenericEncryptedEnvelopeFromZip,
  wrapGenericEncryptedZip,
  type BrowserCompatibilityAssessment,
  type DeviceCapabilityTierNumber,
  type GenericEncryptedEnvelope,
  type GenericP2pSignalEnvelope,
  type GenericP2pWireConfig,
  type GenericWorkloadEvaluation,
  type HeavyZipExportGate,
  type QrSvgOptions,
} from '@engine/primitives';
import {
  createResilientStorageAdapter,
  exportPortableStorageBundle,
  type IStorageAdapter,
  NativeBridgeStorageAdapter,
  type PortableStorageBundle,
  restorePortableStorageBundle,
} from '@engine/storage';
import {
  exportPortableVault,
  restorePortableVault,
  type VaultExportResult,
} from '@features/backup-vault';
import {
  type CsvExportOutput,
  exportRecordsToCsv,
} from '@features/csv-exporter';
import {
  type CsvImportOptions,
  type CsvImportResult,
  runCsvImport,
} from '@features/csv-importer';
import {
  buildPrintableHtmlDocument,
  dispatchHtmlDownloadPackage,
  dispatchPrintPackage,
  type PrintableHtmlSpec,
} from '@features/document-export';
import {
  buildGenericIcsCalendar,
  type GenericCalendarEventInput,
  type GenericIcsOutput,
} from '@features/ics-calendar';
import {
  extractStructuredFieldsFromOcr,
  type OcrExtractionOutput,
  type OcrFieldExtractionRule,
  type OcrWordToken,
} from '@features/ocr-parser';
import {
  type AnimalCsvConfigOptions,
  type AnimalCsvFieldKey,
  createAnimalCsvExportSchema,
  createAnimalCsvSchemaConfig,
} from './animalCsvConfig';
import {
  deserializeAnimalProfiles,
  normalizeAnimalProfileRecord,
  serializeAnimalProfiles,
} from './animalProfileSchema';
import { PEDIGREE_APP_CONFIG } from './pedigreeAppConfig';
import type { AppRuntimeServices } from './appConfig.interface';
import {
  createPedigreeBridgePlatformAdapter,
  pedigreeBridge,
  type PedigreeBridge,
} from '../native/pedigreeBridge';
import { configureCapturedIdeasBackingStore } from '../storage/capturedIdeasStore';
import { logDiagnosticEvent, markCleanSessionExit, recordReactCrash } from '../storage/crashLogger';
import {
  isOpfsSupported,
  markTempOpfsFileActive,
  readTempOpfsFileAsBlob,
  removeTempOpfsFile,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from '../storage/opfsStorage';
import type { StorageAdapter } from '../storage/storageAdapter';
import { acquireForegroundTransferLease } from '../storage/storageProbes';
import {
  configureStorageProtectionBridge,
  isIosBrowser,
  isStandalonePwa,
  recordServerDateHeaderSkew,
} from '../storage/storageProtection';
import { WebSqliteAdapter } from '../storage/webSqliteAdapter';
import { configureGoogleCalendarClient } from '../utils/googleCalendarClient';
import { configureLazyRouteDefaults } from '../utils/lazyRoute';
import { configureWebFileBridge, configureWebFileRuntime } from '../utils/webFileActions';

export { PEDIGREE_APP_CONFIG };

const ANIMAL_PROFILES_STORAGE_KEY = 'pedigree:animal-profiles:v1';
const PEDIGREE_VAULT_FORMAT_TAG = 'community-pedigree-vault-v1';

let cachedDefaultPedigreeBridge: IPlatformBridge | null = null;
let runtimeDefaultsInitialized = false;

export function createPedigreePlatformBridge(options: PlatformBridgeOptions = {}): IPlatformBridge {
  return createPlatformBridge({
    nativeBridgeKey: 'pedigreeNative',
    ...options,
  });
}

export function createPedigreeBridgeAdapter(options: {
  nativeBridge?: PedigreeBridge;
  bridge?: IPlatformBridge;
} = {}): IPlatformBridge {
  const baseBridge = options.bridge ?? createPedigreePlatformBridge();
  return createPedigreeBridgePlatformAdapter(options.nativeBridge ?? pedigreeBridge, baseBridge);
}

export function initializePedigreeRuntimeDefaults(bridge?: IPlatformBridge): IPlatformBridge {
  const activeBridge = bridge ?? cachedDefaultPedigreeBridge ?? createPedigreeBridgeAdapter();
  cachedDefaultPedigreeBridge = activeBridge;

  configureLazyRouteDefaults({
    reloadSessionKey: 'pedigree_chunk_reload_ts',
    pendingBootSessionKey: 'pedigree_pending_boot_ts',
    onDiagnosticEvent: (entry) => logDiagnosticEvent(entry),
    onCleanSessionExit: () => markCleanSessionExit(),
    onReactCrash: (error, stack) => recordReactCrash(error, stack),
  });

  configureWebFileBridge({
    isNativeWrapper: () => activeBridge.getCapabilities().hasNativeBridge,
    exportOrShareBinary: (req) => activeBridge.exportBinary(req),
  });

  configureWebFileRuntime({
    onDiagnosticEvent: (entry) => logDiagnosticEvent(entry),
    acquireForegroundTransferLease: () => acquireForegroundTransferLease(),
    isIosBrowser: () => isIosBrowser(),
    isStandalonePwa: () => isStandalonePwa(),
    opfsTemp: {
      isSupported: () => isOpfsSupported(),
      markActive: (fileName) => markTempOpfsFileActive(fileName),
      unmarkActive: (fileName) => unmarkTempOpfsFileActive(fileName),
      readAsBlob: (fileName) => readTempOpfsFileAsBlob(fileName),
      remove: (fileName) => removeTempOpfsFile(fileName),
      write: (prefix, payload, ext, opts) => writeTempOpfsFile(prefix, payload, ext, opts),
      writeStreamed: (prefix, ext, writer, opts) =>
        writeTempOpfsFileStreamed(prefix, ext, writer, opts),
    },
  });

  configureGoogleCalendarClient({
    onDiagnosticEvent: (entry) => logDiagnosticEvent(entry),
    onServerDateHeader: (dateHeader) => recordServerDateHeaderSkew(dateHeader),
  });

  configureStorageProtectionBridge(activeBridge);
  const caps = activeBridge.getCapabilities();
  if (caps.requiresIosStorageBridge && caps.hasNativeBridge && activeBridge.invokeStorageBridge) {
    configureCapturedIdeasBackingStore(
      new NativeBridgeStorageAdapter(activeBridge, 'pedigree_ideas')
    );
  } else {
    configureCapturedIdeasBackingStore(null);
  }
  runtimeDefaultsInitialized = true;
  return activeBridge;
}

export function getDefaultPedigreeBridge(): IPlatformBridge {
  if (!cachedDefaultPedigreeBridge || !runtimeDefaultsInitialized) {
    return initializePedigreeRuntimeDefaults(cachedDefaultPedigreeBridge ?? undefined);
  }
  return cachedDefaultPedigreeBridge;
}

/**
 * Constructs the Layer 3 domain `StorageAdapter`.
 * When running in an Apple `WKWebView` (`requiresIosStorageBridge === true`), routes
 * SQLite binary persistence through `NativeBridgeStorageAdapter` (native iOS SQLite in
 * `Application Support/`) instead of evictable WebKit IndexedDB.
 */
export function createPedigreeDomainStorageAdapter(options: {
  bridge?: IPlatformBridge;
  backingStore?: IStorageAdapter;
  namespace?: string;
} = {}): StorageAdapter {
  if (options.backingStore) {
    return new WebSqliteAdapter(undefined, options.backingStore);
  }
  const activeBridge = options.bridge ?? getDefaultPedigreeBridge();
  const caps = activeBridge.getCapabilities();
  if (caps.requiresIosStorageBridge && caps.hasNativeBridge && activeBridge.invokeStorageBridge) {
    const nativeBacking = new NativeBridgeStorageAdapter(
      activeBridge,
      options.namespace || 'pedigree_db'
    );
    return new WebSqliteAdapter(undefined, nativeBacking);
  }
  return new WebSqliteAdapter();
}

export async function createPedigreeStorageRuntime(options: {
  bridge?: IPlatformBridge;
  preferSqliteWasm?: boolean;
  namespace?: string;
} = {}): Promise<{ bridge: IPlatformBridge; storage: IStorageAdapter }> {
  const bridge = options.bridge ?? createPedigreePlatformBridge();
  const storage = await createResilientStorageAdapter({
    namespace: options.namespace || 'pedigree_alpha3',
    bridge,
    preferSqliteWasm: options.preferSqliteWasm ?? true,
  });
  return { bridge, storage };
}

export async function createPedigreeAppRuntime(options: {
  bridge?: IPlatformBridge;
  preferSqliteWasm?: boolean;
  namespace?: string;
  domainStorage?: StorageAdapter;
} = {}): Promise<AppRuntimeServices> {
  const bridge = options.bridge ?? createPedigreeBridgeAdapter();
  const { storage } = await createPedigreeStorageRuntime({
    bridge,
    preferSqliteWasm: options.preferSqliteWasm,
    namespace: options.namespace,
  });
  return {
    bridge,
    storage,
    domainStorage: options.domainStorage,
  };
}

export interface AnimalProfileRepository {
  loadProfiles(): Promise<Animal[]>;
  saveProfiles(profiles: Animal[]): Promise<number>;
  upsertProfiles(incoming: Animal[]): Promise<{ total: number; added: number; updated: number }>;
  removeProfile(id: string): Promise<boolean>;
  exportBundle(): Promise<PortableStorageBundle>;
  restoreBundle(bundle: PortableStorageBundle | string): Promise<{ restoredCount: number }>;
}

export function createAnimalProfileRepository(storage: IStorageAdapter): AnimalProfileRepository {
  async function loadProfiles(): Promise<Animal[]> {
    const raw = await storage.getItem(ANIMAL_PROFILES_STORAGE_KEY);
    if (typeof raw !== 'string' || !raw.trim()) {
      return [];
    }
    return deserializeAnimalProfiles(raw);
  }

  async function saveProfiles(profiles: Animal[]): Promise<number> {
    const normalized = profiles.map((p) => normalizeAnimalProfileRecord(p, p.species || 'Rabbit'));
    await storage.setItem(ANIMAL_PROFILES_STORAGE_KEY, serializeAnimalProfiles(normalized));
    if (storage.flush) {
      await storage.flush();
    }
    return normalized.length;
  }

  async function upsertProfiles(
    incoming: Animal[]
  ): Promise<{ total: number; added: number; updated: number }> {
    const existing = await loadProfiles();
    const byId = new Map<string, Animal>();
    for (const item of existing) {
      byId.set(item.id, item);
    }
    let added = 0;
    let updated = 0;
    for (const item of incoming) {
      const clean = normalizeAnimalProfileRecord(item, item.species || 'Rabbit');
      if (byId.has(clean.id)) {
        updated += 1;
      } else {
        added += 1;
      }
      byId.set(clean.id, clean);
    }
    const merged = Array.from(byId.values());
    await saveProfiles(merged);
    return { total: merged.length, added, updated };
  }

  async function removeProfile(id: string): Promise<boolean> {
    const existing = await loadProfiles();
    const filtered = existing.filter((p) => p.id !== id);
    if (filtered.length === existing.length) {
      return false;
    }
    await saveProfiles(filtered);
    return true;
  }

  return {
    loadProfiles,
    saveProfiles,
    upsertProfiles,
    removeProfile,
    exportBundle: () => exportPortableStorageBundle(storage, 'pedigree:'),
    restoreBundle: (bundle) => restorePortableStorageBundle(storage, bundle),
  };
}

export interface AnimalCsvImportWorkflowOptions
  extends AnimalCsvConfigOptions,
    CsvImportOptions<AnimalCsvFieldKey> {}

export async function importAnimalCsvToStorage(
  input: string | Uint8Array,
  storage: IStorageAdapter,
  options: AnimalCsvImportWorkflowOptions = {}
): Promise<CsvImportResult<Animal, AnimalCsvFieldKey>> {
  const schema = createAnimalCsvSchemaConfig({
    fallbackSpecies: options.fallbackSpecies,
    defaultWeightUnit: options.defaultWeightUnit,
  });
  const repository = createAnimalProfileRepository(storage);

  return runCsvImport(
    input,
    schema,
    async (records) => {
      await repository.upsertProfiles(records);
      return { savedCount: records.length };
    },
    {
      columnOverrides: options.columnOverrides,
      skipInvalidRows: options.skipInvalidRows,
      dryRun: options.dryRun,
    }
  );
}

export async function exportAnimalCsvFromStorage(
  storage: IStorageAdapter,
  options: {
    species?: string;
    weightUnit?: WeightUnit;
    dateSlug?: string;
  } = {}
): Promise<CsvExportOutput> {
  const repo = createAnimalProfileRepository(storage);
  const all = await repo.loadProfiles();
  const byId = new Map<string, Animal>(all.map((a) => [a.id, a]));
  const filtered = options.species
    ? all.filter((a) => a.species.toLowerCase() === options.species!.toLowerCase())
    : all;
  const schema = createAnimalCsvExportSchema({
    animalById: byId,
    weightUnit: options.weightUnit,
  });
  return exportRecordsToCsv(filtered, schema, {
    filePrefix: 'pedigree',
    segment: options.species,
    dateSlug: options.dateSlug,
  });
}

export async function exportPedigreePortableVault(
  storage: IStorageAdapter,
  options: { compressZip?: boolean } = {}
): Promise<VaultExportResult> {
  return exportPortableVault(storage, {
    appFormatTag: PEDIGREE_VAULT_FORMAT_TAG,
    schemaVersion: 6,
    keyPrefix: 'pedigree:',
    compressZip: options.compressZip,
  });
}

export async function restorePedigreePortableVault(
  storage: IStorageAdapter,
  input: string | Uint8Array,
  options: { clearExisting?: boolean } = {}
): Promise<{ restoredCount: number }> {
  const res = await restorePortableVault(storage, input, {
    expectedAppFormatTag: PEDIGREE_VAULT_FORMAT_TAG,
    clearExisting: options.clearExisting,
  });
  return { restoredCount: res.restoredCount };
}

export async function printPedigreeDocument(
  bridge: IPlatformBridge,
  spec: PrintableHtmlSpec
): Promise<boolean> {
  const pkg = buildPrintableHtmlDocument(spec);
  return dispatchPrintPackage(bridge, pkg);
}

export async function downloadPedigreeDocumentHtml(
  bridge: IPlatformBridge,
  spec: PrintableHtmlSpec,
  filename: string
) {
  const pkg = buildPrintableHtmlDocument(spec);
  return dispatchHtmlDownloadPackage(bridge, pkg, filename, 'save');
}

export function buildBarnTasksIcsFeed(
  tasks: readonly BarnTask[],
  options: {
    calendarName?: string;
    alarmMinutesList?: number[];
    dtStampIso?: string;
  } = {}
): GenericIcsOutput {
  const events: GenericCalendarEventInput[] = tasks
    .filter((t) => !t.completed && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso))
    .map((task) => ({
      id: task.id,
      title: task.title,
      dateIso: task.dueDateIso,
      allDay: false,
      startHour: 8,
      startMinute: 0,
      durationMinutes: 30,
      description: task.linkedAnimalName
        ? `${task.category} (${task.priority}): ${task.linkedAnimalName}`
        : `${task.category} (${task.priority})`,
      categories: [task.species, task.category].filter(Boolean),
      alarmMinutesList: options.alarmMinutesList ?? [60],
    }));

  return buildGenericIcsCalendar(events, {
    calendarName: options.calendarName || 'Community Pedigree Tasks',
    prodId: '-//CommunityPedigree//BarnTasks//EN',
    uidDomain: 'pedigree.local',
    dtStampIso: options.dtStampIso,
  });
}

export type PedigreeOcrSummaryField =
  | 'name'
  | 'tattoo'
  | 'birthDateIso'
  | 'registrationNumber'
  | 'breed'
  | 'weight';

const PEDIGREE_OCR_RULES: readonly OcrFieldExtractionRule<PedigreeOcrSummaryField>[] = [
  { key: 'name', patterns: [/(?:name|animal)\s*[:#]\s*([^\n\r]+)/i] },
  { key: 'tattoo', patterns: [/(?:tattoo|ear(?:\s*tag|\s*id)?)\s*[:#]\s*([A-Za-z0-9-]+)/i] },
  { key: 'birthDateIso', patterns: [/(?:dob|born|kindled|birth\s*date)\s*[:#]\s*([0-9/\-]+)/i] },
  { key: 'registrationNumber', patterns: [/(?:reg(?:istration)?(?:\s*no\.?)?)\s*[:#]\s*([A-Za-z0-9-]+)/i] },
  { key: 'breed', patterns: [/breed\s*[:#]\s*([^\n\r]+)/i] },
  { key: 'weight', patterns: [/(?:wt|weight)\s*[:#]\s*([0-9.]+\s*(?:lbs?|oz|kg|g)?)/i] },
];

export function extractPedigreeOcrSummary(
  rawText: string,
  wordBoxes?: readonly OcrWordToken[]
): OcrExtractionOutput<PedigreeOcrSummaryField> {
  return extractStructuredFieldsFromOcr(rawText, PEDIGREE_OCR_RULES, wordBoxes);
}

export const PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT = 'community-pedigree-encrypted-v1';

export function wrapPedigreeEncryptedZip(
  envelope: GenericEncryptedEnvelope,
  originalFileNameLabel?: string
): Uint8Array {
  return wrapGenericEncryptedZip({
    envelope,
    payloadEntryName: 'ENCRYPTED-PAYLOAD.json',
    readmeTitle: 'Community Pedigree — Passphrase-Encrypted Backup',
    restoreHint:
      'Restore via Community Pedigree -> Settings -> Import Backup with your passphrase.',
    originalFileNameLabel,
  });
}

export function extractPedigreeEncryptedEnvelopeFromZip(
  bytes: Uint8Array,
  fileName?: string
): GenericEncryptedEnvelope | null {
  return tryExtractGenericEncryptedEnvelopeFromZip(bytes, {
    fileName,
    expectedFormat: PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT,
    payloadEntryName: 'ENCRYPTED-PAYLOAD.json',
  });
}

export const PEDIGREE_P2P_WIRE_CONFIG: GenericP2pWireConfig<
  'pedigree-p2p-delta-v1',
  'pedigree-p2p-ack-v1'
> = {
  deltaKind: 'pedigree-p2p-delta-v1',
  ackKind: 'pedigree-p2p-ack-v1',
  signalPrefix: 'PEDIGREE-P2P-V1:',
  invalidPayloadMessage: 'Unrecognized P2P message format.',
};

export function encodePedigreeP2pSignal(envelope: GenericP2pSignalEnvelope): string {
  return encodeGenericP2pSignalToken(envelope, PEDIGREE_P2P_WIRE_CONFIG.signalPrefix);
}

export function decodePedigreeP2pSignal(raw: string): GenericP2pSignalEnvelope {
  return decodeGenericP2pSignalToken(raw, PEDIGREE_P2P_WIRE_CONFIG.signalPrefix);
}

export function buildPedigreeRecordDeepLink(params: {
  baseUrl?: string;
  animalId: string;
  species?: string;
  tab?: string;
}): string {
  return buildQueryDeepLink(params.baseUrl, [
    ['view', params.tab || 'pedigree'],
    ['species', params.species],
    ['animal', params.animalId],
  ]);
}

export function renderPedigreeQrSvg(text: string, options?: QrSvgOptions): string {
  return renderQrSvg(text, {
    ariaLabel: 'Community Pedigree QR code',
    ...options,
  });
}

export function evaluatePedigreeWorkloadForDevice(
  totalAnimals: number,
  assessment: { definition: { maxRecommendedRecords: number | null; shortLabel: string } }
): GenericWorkloadEvaluation {
  return evaluateGenericWorkloadForTier(totalAnimals, assessment);
}

export function getPedigreeHeavyZipGate(
  assessment: { tier: DeviceCapabilityTierNumber },
  browserCompat: BrowserCompatibilityAssessment
): HeavyZipExportGate {
  return getGenericHeavyZipExportGate(assessment, browserCompat, {
    datasetLabel: 'herd records',
    jsonBackupLabel: 'Timestamped Backup (.JSON)',
  });
}

