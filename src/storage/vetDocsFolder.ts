/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Local Veterinary PDF Folder Pointer & External Backup Reminder Adapter (`src/storage/vetDocsFolder.ts`).
 *
 * Stores a device-local read-only `FileSystemDirectoryHandle` in IndexedDB (`sync_handles`
 * under key `'vet_docs_folder'`) plus lightweight folder metadata and reminder timestamps
 * in `localStorage` (`pedigree.vetDocsMeta.v1`). Never uploads, mutates, or duplicates
 * user PDF binaries into app backups.
 */

import {
  createDefaultVetDocsFolderMeta,
  DEFAULT_ALLOWED_WIKI_LANGUAGES,
  DEFAULT_PREFERRED_WIKI_SOURCES,
  DEFAULT_RESTRICTED_WIKI_SOURCES,
  evaluateVetDocsBackupReminder,
  filterAndSortVetPdfEntries,
  isPdfFileName,
  MAX_VET_PDF_ENTRIES,
  MAX_VET_PDF_PREVIEW_BYTES,
  MAX_VET_PDF_SCAN_DEPTH,
  normalizeAllowedWikiLanguages,
  normalizePreferredDomainSuffix,
  normalizePreferredWikiSources,
  normalizeReminderIntervalDays,
  normalizeRestrictedDomain,
  normalizeRestrictedWikiSources,
  normalizeVetDocsFolderMeta,
  PreferredWikiSource,
  RestrictedWikiSource,
  VetDocFileEntry,
  VetDocsBackupReminderEvaluation,
  VetDocsFolderMeta,
  VetDocsReminderIntervalDays,
} from '../domain/healthReference';
import { sanitizeSingleLineText, validateUploadFileSize } from '../domain/inputSanitization';
import { nowEpochMs } from '../domain/models';
import {
  deleteNamedDirectoryHandleFromIdb,
  loadNamedDirectoryHandleFromIdb,
  queryDirectoryHandleReadPermission,
  saveNamedDirectoryHandleToIdb,
  supportsDirectoryPicker,
  SyncDirectoryHandleLike,
  SyncFileHandleLike,
} from './localSyncChannels';
import { getSafeLocalStorage } from './storageProbes';
import { getAdjustedNowIsoUtc } from './storageProtection';

export const VET_DOCS_HANDLE_KEY = 'vet_docs_folder';
export const VET_DOCS_META_LS_KEY = 'pedigree.vetDocsMeta.v1';
export const RESTRICTED_WIKI_SOURCES_LS_KEY = 'pedigree.restrictedWikiSources.v1';
export const PREFERRED_WIKI_SOURCES_LS_KEY = 'pedigree.preferredWikiSources.v1';
export const ALLOWED_WIKI_LANGUAGES_LS_KEY = 'pedigree.allowedWikiLanguages.v1';

export type VetDocPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

export interface VetDocsFolderStatus {
  supported: boolean;
  hasDirectoryHandle: boolean;
  permissionState: VetDocPermissionState;
  meta: VetDocsFolderMeta;
  reminder: VetDocsBackupReminderEvaluation;
}

export interface VetDocsScanResult {
  entries: VetDocFileEntry[];
  fileHandles: Map<string, SyncFileHandleLike>;
  truncated: boolean;
  scannedAtIso: string;
}

type VetDocsMetaListener = (meta: VetDocsFolderMeta) => void;
const metaListeners = new Set<VetDocsMetaListener>();

let testVetDocsHandleOverride: SyncDirectoryHandleLike | null = null;
export function setVetDocsHandleForTest(handle: SyncDirectoryHandleLike | null): void {
  testVetDocsHandleOverride = handle;
}

export function subscribeVetDocsMetaChange(listener: VetDocsMetaListener): () => void {
  metaListeners.add(listener);
  return () => {
    metaListeners.delete(listener);
  };
}

function emitVetDocsMetaChange(meta: VetDocsFolderMeta): void {
  metaListeners.forEach((listener) => {
    try {
      listener(meta);
    } catch {
      // Ignore subscriber error
    }
  });
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('pedigree:vet-docs-meta-changed', { detail: meta }));
    } catch {
      // Ignore event dispatch restriction
    }
  }
}

export function readLocalVetDocsMeta(): VetDocsFolderMeta {
  const ls = getSafeLocalStorage();
  if (!ls) return createDefaultVetDocsFolderMeta();
  try {
    const raw = ls.getItem(VET_DOCS_META_LS_KEY);
    if (!raw) return createDefaultVetDocsFolderMeta();
    return normalizeVetDocsFolderMeta(JSON.parse(raw));
  } catch {
    return createDefaultVetDocsFolderMeta();
  }
}

export function writeLocalVetDocsMeta(next: VetDocsFolderMeta | null): VetDocsFolderMeta {
  const normalized = next ? normalizeVetDocsFolderMeta(next) : createDefaultVetDocsFolderMeta();
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      if (!next) {
        ls.removeItem(VET_DOCS_META_LS_KEY);
      } else {
        ls.setItem(VET_DOCS_META_LS_KEY, JSON.stringify(normalized));
      }
    } catch {
      // Ignore storage quota warning
    }
  }
  emitVetDocsMetaChange(normalized);
  return normalized;
}

type RestrictedWikiSourcesListener = (sources: RestrictedWikiSource[]) => void;
const restrictedSourcesListeners = new Set<RestrictedWikiSourcesListener>();

export function subscribeRestrictedWikiSourcesChange(
  listener: RestrictedWikiSourcesListener
): () => void {
  restrictedSourcesListeners.add(listener);
  return () => {
    restrictedSourcesListeners.delete(listener);
  };
}

function emitRestrictedWikiSourcesChange(sources: RestrictedWikiSource[]): void {
  restrictedSourcesListeners.forEach((listener) => {
    try {
      listener(sources);
    } catch {
      // Ignore subscriber error
    }
  });
}

export function readRestrictedWikiSources(): RestrictedWikiSource[] {
  const ls = getSafeLocalStorage();
  if (!ls) return normalizeRestrictedWikiSources(null);
  try {
    const raw = ls.getItem(RESTRICTED_WIKI_SOURCES_LS_KEY);
    if (!raw) return normalizeRestrictedWikiSources(null);
    return normalizeRestrictedWikiSources(JSON.parse(raw));
  } catch {
    return normalizeRestrictedWikiSources(null);
  }
}

function writeRestrictedWikiSources(next: RestrictedWikiSource[]): RestrictedWikiSource[] {
  const normalized = normalizeRestrictedWikiSources(next);
  const customOnly = normalized.filter((item) => !item.builtIn);
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      if (customOnly.length === 0) {
        ls.removeItem(RESTRICTED_WIKI_SOURCES_LS_KEY);
      } else {
        ls.setItem(RESTRICTED_WIKI_SOURCES_LS_KEY, JSON.stringify(customOnly));
      }
    } catch {
      // Ignore storage quota warning
    }
  }
  emitRestrictedWikiSourcesChange(normalized);
  return normalized;
}

export function addCustomRestrictedWikiSource(input: {
  name: string;
  domain?: string;
  reason?: string;
}): RestrictedWikiSource[] {
  const cleanName = sanitizeSingleLineText(input.name, 120);
  const cleanDomain = input.domain ? normalizeRestrictedDomain(input.domain) : '';
  if (!cleanName && !cleanDomain) {
    return readRestrictedWikiSources();
  }
  const effectiveName = cleanName || cleanDomain;
  const current = readRestrictedWikiSources();
  const isBuiltInMatch = DEFAULT_RESTRICTED_WIKI_SOURCES.some(
    (entry) =>
      entry.name.toLowerCase() === effectiveName.toLowerCase() ||
      (cleanDomain && entry.domains.includes(cleanDomain))
  );
  if (isBuiltInMatch) {
    return current;
  }

  const cleanReason =
    sanitizeSingleLineText(input.reason ?? '', 220) ||
    'Added to barn restricted wiki sources list.';

  const slug =
    effectiveName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'source';
  const id = `restricted-custom-${slug}`;

  const existingIndex = current.findIndex(
    (item) => !item.builtIn && (item.id === id || item.name.toLowerCase() === effectiveName.toLowerCase())
  );

  const nextEntry: RestrictedWikiSource = {
    id,
    name: effectiveName,
    domains: cleanDomain ? [cleanDomain] : [],
    reason: cleanReason,
    builtIn: false,
  };

  if (existingIndex >= 0) {
    const mergedDomains = Array.from(
      new Set([...current[existingIndex].domains, ...nextEntry.domains])
    );
    const updated = current.slice();
    updated[existingIndex] = {
      ...nextEntry,
      domains: mergedDomains,
    };
    return writeRestrictedWikiSources(updated);
  }

  return writeRestrictedWikiSources([...current, nextEntry]);
}

export function removeCustomRestrictedWikiSource(id: string): RestrictedWikiSource[] {
  const current = readRestrictedWikiSources();
  const target = current.find((item) => item.id === id);
  if (!target || target.builtIn) {
    return current;
  }
  return writeRestrictedWikiSources(current.filter((item) => item.id !== id));
}

type PreferredWikiSourcesListener = (sources: PreferredWikiSource[]) => void;
const preferredSourcesListeners = new Set<PreferredWikiSourcesListener>();

export function subscribePreferredWikiSourcesChange(
  listener: PreferredWikiSourcesListener
): () => void {
  preferredSourcesListeners.add(listener);
  return () => {
    preferredSourcesListeners.delete(listener);
  };
}

function emitPreferredWikiSourcesChange(sources: PreferredWikiSource[]): void {
  preferredSourcesListeners.forEach((listener) => {
    try {
      listener(sources);
    } catch {
      // Ignore subscriber error
    }
  });
}

export function readPreferredWikiSources(): PreferredWikiSource[] {
  const ls = getSafeLocalStorage();
  if (!ls) return normalizePreferredWikiSources(null);
  try {
    const raw = ls.getItem(PREFERRED_WIKI_SOURCES_LS_KEY);
    if (!raw) return normalizePreferredWikiSources(null);
    return normalizePreferredWikiSources(JSON.parse(raw));
  } catch {
    return normalizePreferredWikiSources(null);
  }
}

function writePreferredWikiSources(next: PreferredWikiSource[]): PreferredWikiSource[] {
  const normalized = normalizePreferredWikiSources(next);
  const customOnly = normalized.filter((item) => !item.builtIn);
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      if (customOnly.length === 0) {
        ls.removeItem(PREFERRED_WIKI_SOURCES_LS_KEY);
      } else {
        ls.setItem(PREFERRED_WIKI_SOURCES_LS_KEY, JSON.stringify(customOnly));
      }
    } catch {
      // Ignore storage quota warning
    }
  }
  emitPreferredWikiSourcesChange(normalized);
  return normalized;
}

export function addCustomPreferredWikiSource(input: {
  name: string;
  domain?: string;
  domainSuffix?: string;
  description?: string;
}): PreferredWikiSource[] {
  const cleanName = sanitizeSingleLineText(input.name, 140);
  const cleanDomain = input.domain ? normalizeRestrictedDomain(input.domain) : '';
  const cleanSuffix = input.domainSuffix ? normalizePreferredDomainSuffix(input.domainSuffix) : '';
  if (!cleanName && !cleanDomain && !cleanSuffix) {
    return readPreferredWikiSources();
  }
  const effectiveName = cleanName || cleanDomain || cleanSuffix;
  const current = readPreferredWikiSources();
  const isBuiltInMatch = DEFAULT_PREFERRED_WIKI_SOURCES.some(
    (entry) =>
      entry.name.toLowerCase() === effectiveName.toLowerCase() ||
      (cleanDomain && entry.domains.includes(cleanDomain))
  );
  if (isBuiltInMatch) {
    return current;
  }

  const cleanDescription =
    sanitizeSingleLineText(input.description ?? '', 220) ||
    'Added to barn preferred health wiki sources list.';
  const slug =
    effectiveName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'source';
  const id = `preferred-custom-${slug}`;

  const existingIndex = current.findIndex(
    (item) =>
      !item.builtIn && (item.id === id || item.name.toLowerCase() === effectiveName.toLowerCase())
  );

  const nextEntry: PreferredWikiSource = {
    id,
    name: effectiveName,
    category: 'custom',
    categoryLabel: 'Custom Preferred Source',
    domains: cleanDomain ? [cleanDomain] : [],
    domainSuffixes: cleanSuffix ? [cleanSuffix] : [],
    nameKeywords: [effectiveName.toLowerCase()],
    description: cleanDescription,
    builtIn: false,
  };

  if (existingIndex >= 0) {
    const updated = current.slice();
    updated[existingIndex] = {
      ...nextEntry,
      domains: Array.from(new Set([...current[existingIndex].domains, ...nextEntry.domains])),
      domainSuffixes: Array.from(
        new Set([...current[existingIndex].domainSuffixes, ...nextEntry.domainSuffixes])
      ),
    };
    return writePreferredWikiSources(updated);
  }

  return writePreferredWikiSources([...current, nextEntry]);
}

export function removeCustomPreferredWikiSource(id: string): PreferredWikiSource[] {
  const current = readPreferredWikiSources();
  const target = current.find((item) => item.id === id);
  if (!target || target.builtIn) {
    return current;
  }
  return writePreferredWikiSources(current.filter((item) => item.id !== id));
}

type AllowedWikiLanguagesListener = (languages: string[]) => void;
const allowedWikiLanguagesListeners = new Set<AllowedWikiLanguagesListener>();

export function subscribeAllowedWikiLanguagesChange(
  listener: AllowedWikiLanguagesListener
): () => void {
  allowedWikiLanguagesListeners.add(listener);
  return () => {
    allowedWikiLanguagesListeners.delete(listener);
  };
}

export function readAllowedWikiLanguages(): string[] {
  const ls = getSafeLocalStorage();
  if (!ls) return [...DEFAULT_ALLOWED_WIKI_LANGUAGES];
  try {
    const raw = ls.getItem(ALLOWED_WIKI_LANGUAGES_LS_KEY);
    if (!raw) return [...DEFAULT_ALLOWED_WIKI_LANGUAGES];
    return normalizeAllowedWikiLanguages(JSON.parse(raw));
  } catch {
    return [...DEFAULT_ALLOWED_WIKI_LANGUAGES];
  }
}

export function setAllowedWikiLanguages(languages: ReadonlyArray<string>): string[] {
  const normalized = normalizeAllowedWikiLanguages(languages);
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      const isDefault =
        normalized.length === DEFAULT_ALLOWED_WIKI_LANGUAGES.length &&
        normalized.every((code, idx) => code === DEFAULT_ALLOWED_WIKI_LANGUAGES[idx]);
      if (isDefault) {
        ls.removeItem(ALLOWED_WIKI_LANGUAGES_LS_KEY);
      } else {
        ls.setItem(ALLOWED_WIKI_LANGUAGES_LS_KEY, JSON.stringify(normalized));
      }
    } catch {
      // Ignore storage quota warning
    }
  }
  allowedWikiLanguagesListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch {
      // Ignore subscriber error
    }
  });
  return normalized;
}

async function loadVetDocsHandleRecord(): Promise<{
  handle: SyncDirectoryHandleLike;
  folderName: string;
  configuredAtIso: string;
} | null> {
  if (testVetDocsHandleOverride) {
    return {
      handle: testVetDocsHandleOverride,
      folderName: String(testVetDocsHandleOverride.name || 'Test Vet PDFs'),
      configuredAtIso: getAdjustedNowIsoUtc(),
    };
  }
  const rec = await loadNamedDirectoryHandleFromIdb(VET_DOCS_HANDLE_KEY);
  return rec?.handle
    ? {
        handle: rec.handle,
        folderName: rec.folderName,
        configuredAtIso: rec.configuredAtIso,
      }
    : null;
}

export async function getVetDocsFolderStatus(
  nowMs: number = nowEpochMs()
): Promise<VetDocsFolderStatus> {
  const meta = readLocalVetDocsMeta();
  const supported = supportsDirectoryPicker() || Boolean(testVetDocsHandleOverride);
  if (!supported) {
    return {
      supported: false,
      hasDirectoryHandle: false,
      permissionState: 'unsupported',
      meta,
      reminder: evaluateVetDocsBackupReminder(meta, nowMs, false),
    };
  }

  const record = await loadVetDocsHandleRecord();
  if (!record?.handle) {
    return {
      supported: true,
      hasDirectoryHandle: false,
      permissionState: 'prompt',
      meta,
      reminder: evaluateVetDocsBackupReminder(meta, nowMs, false),
    };
  }

  const permissionState = await queryDirectoryHandleReadPermission(record.handle);
  return {
    supported: true,
    hasDirectoryHandle: true,
    permissionState,
    meta,
    reminder: evaluateVetDocsBackupReminder(meta, nowMs, true),
  };
}

function asSubdirectoryHandle(entry: SyncFileHandleLike): SyncDirectoryHandleLike | null {
  if (entry.kind !== 'directory') return null;
  const candidate = entry as unknown as SyncDirectoryHandleLike;
  if (typeof candidate.entries !== 'function') return null;
  return candidate;
}

export async function scanVetDocsDirectory(
  dirHandle: SyncDirectoryHandleLike,
  options?: { maxDepth?: number; maxEntries?: number }
): Promise<VetDocsScanResult> {
  const maxDepth = Math.max(0, options?.maxDepth ?? MAX_VET_PDF_SCAN_DEPTH);
  const maxEntries = Math.max(1, options?.maxEntries ?? MAX_VET_PDF_ENTRIES);
  const entries: VetDocFileEntry[] = [];
  const fileHandles = new Map<string, SyncFileHandleLike>();
  let truncated = false;

  const visit = async (
    current: SyncDirectoryHandleLike,
    prefix: string,
    depth: number
  ): Promise<void> => {
    if (entries.length >= maxEntries) {
      truncated = true;
      return;
    }
    if (typeof current.entries !== 'function') return;

    for await (const [rawName, handle] of current.entries()) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const cleanName = sanitizeSingleLineText(rawName || handle?.name || '', 180);
      if (!cleanName) continue;
      const relativePath = prefix ? `${prefix}/${cleanName}` : cleanName;

      if (handle.kind === 'directory') {
        if (depth < maxDepth) {
          const sub = asSubdirectoryHandle(handle);
          if (sub) {
            await visit(sub, relativePath, depth + 1);
          }
        }
        continue;
      }

      if (!isPdfFileName(cleanName)) continue;

      let sizeBytes = 0;
      let lastModifiedMs = 0;
      if (typeof handle.getFile === 'function') {
        try {
          const file = await handle.getFile();
          sizeBytes = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
          lastModifiedMs =
            'lastModified' in file &&
            typeof (file as File).lastModified === 'number' &&
            Number.isFinite((file as File).lastModified)
              ? (file as File).lastModified
              : 0;
        } catch {
          // Keep metadata fallback even if individual stat fails
        }
      }

      const id = `pdf:${relativePath}`;
      entries.push({
        id,
        name: cleanName,
        relativePath,
        sizeBytes,
        lastModifiedMs,
        source: 'folder_handle',
      });
      fileHandles.set(id, handle);
    }
  };

  await visit(dirHandle, '', 0);
  const scannedAtIso = getAdjustedNowIsoUtc();
  return {
    entries: filterAndSortVetPdfEntries(entries, ''),
    fileHandles,
    truncated,
    scannedAtIso,
  };
}

export async function connectVetDocsFolder(
  dirHandleOverride?: SyncDirectoryHandleLike
): Promise<{ status: VetDocsFolderStatus; scan: VetDocsScanResult }> {
  let handle = dirHandleOverride ?? testVetDocsHandleOverride ?? null;
  if (!handle) {
    const picker = (
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              showDirectoryPicker?: (opts?: {
                id?: string;
                mode?: 'read' | 'readwrite';
              }) => Promise<SyncDirectoryHandleLike>;
            }
          ).showDirectoryPicker
        : undefined
    );
    if (!picker) {
      throw new Error(
        'Persistent folder pointers (showDirectoryPicker) are not supported in this browser.'
      );
    }
    handle = await picker({ id: 'community-pedigree-vet-pdfs', mode: 'read' });
  }

  if (typeof handle.requestPermission === 'function') {
    const permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') {
      throw new Error('Read permission was not granted for the selected veterinary PDF folder.');
    }
  }

  const folderName = sanitizeSingleLineText(handle.name || 'Veterinary PDFs', 140) || 'Veterinary PDFs';
  await saveNamedDirectoryHandleToIdb(VET_DOCS_HANDLE_KEY, handle, folderName);

  const scan = await scanVetDocsDirectory(handle);
  const prevMeta = readLocalVetDocsMeta();
  const nowIso = scan.scannedAtIso;

  writeLocalVetDocsMeta({
    ...prevMeta,
    folderName,
    configuredAtIso: prevMeta.configuredAtIso || nowIso,
    pdfCount: scan.entries.length,
    lastScannedAtIso: nowIso,
  });

  const status = await getVetDocsFolderStatus();
  return { status, scan };
}

export async function reauthorizeVetDocsFolder(): Promise<{
  status: VetDocsFolderStatus;
  scan: VetDocsScanResult | null;
}> {
  const record = await loadVetDocsHandleRecord();
  if (!record?.handle) {
    return connectVetDocsFolder();
  }
  if (typeof record.handle.requestPermission === 'function') {
    const permission = await record.handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') {
      const status = await getVetDocsFolderStatus();
      return { status, scan: null };
    }
  }
  return refreshVetDocsFolderScan();
}

export async function refreshVetDocsFolderScan(): Promise<{
  status: VetDocsFolderStatus;
  scan: VetDocsScanResult | null;
}> {
  const record = await loadVetDocsHandleRecord();
  if (!record?.handle) {
    const status = await getVetDocsFolderStatus();
    return { status, scan: null };
  }
  const permission = await queryDirectoryHandleReadPermission(record.handle);
  if (permission !== 'granted') {
    const status = await getVetDocsFolderStatus();
    return { status, scan: null };
  }
  const scan = await scanVetDocsDirectory(record.handle);
  const prevMeta = readLocalVetDocsMeta();
  writeLocalVetDocsMeta({
    ...prevMeta,
    folderName: prevMeta.folderName || record.folderName,
    configuredAtIso: prevMeta.configuredAtIso || record.configuredAtIso,
    pdfCount: scan.entries.length,
    lastScannedAtIso: scan.scannedAtIso,
  });
  const status = await getVetDocsFolderStatus();
  return { status, scan };
}

export async function disconnectVetDocsFolder(): Promise<VetDocsFolderStatus> {
  await deleteNamedDirectoryHandleFromIdb(VET_DOCS_HANDLE_KEY);
  const prevMeta = readLocalVetDocsMeta();
  const hasNote = Boolean(prevMeta.folderLocationNote.trim());
  if (!hasNote) {
    writeLocalVetDocsMeta(null);
  } else {
    writeLocalVetDocsMeta({
      ...prevMeta,
      folderName: null,
      pdfCount: null,
      lastScannedAtIso: null,
    });
  }
  return getVetDocsFolderStatus();
}

export async function clearAllVetDocsFolderState(): Promise<void> {
  await deleteNamedDirectoryHandleFromIdb(VET_DOCS_HANDLE_KEY);
  writeLocalVetDocsMeta(null);
  writeRestrictedWikiSources([]);
  writePreferredWikiSources([]);
  setAllowedWikiLanguages(DEFAULT_ALLOWED_WIKI_LANGUAGES);
}

export function saveVetDocsLocationNote(note: string): VetDocsFolderMeta {
  const prev = readLocalVetDocsMeta();
  const cleanNote = sanitizeSingleLineText(note, 180);
  const nowIso = getAdjustedNowIsoUtc();
  if (!cleanNote && !prev.folderName) {
    return writeLocalVetDocsMeta(null);
  }
  return writeLocalVetDocsMeta({
    ...prev,
    folderLocationNote: cleanNote,
    configuredAtIso: cleanNote ? prev.configuredAtIso || nowIso : prev.configuredAtIso,
  });
}

export function markVetDocsBackedUpNow(): VetDocsFolderMeta {
  const prev = readLocalVetDocsMeta();
  const nowIso = getAdjustedNowIsoUtc();
  return writeLocalVetDocsMeta({
    ...prev,
    configuredAtIso: prev.configuredAtIso || nowIso,
    lastBackedUpAtIso: nowIso,
    snoozedUntilMs: 0,
  });
}

export function snoozeVetDocsBackupReminder(
  days: number = 7,
  nowMs: number = nowEpochMs()
): VetDocsFolderMeta {
  const prev = readLocalVetDocsMeta();
  const safeDays = Math.max(1, Math.min(90, Math.round(days)));
  return writeLocalVetDocsMeta({
    ...prev,
    snoozedUntilMs: nowMs + safeDays * 24 * 60 * 60 * 1000,
  });
}

export function setVetDocsReminderIntervalDays(
  intervalDays: VetDocsReminderIntervalDays
): VetDocsFolderMeta {
  const prev = readLocalVetDocsMeta();
  return writeLocalVetDocsMeta({
    ...prev,
    reminderIntervalDays: normalizeReminderIntervalDays(intervalDays),
  });
}

export async function readVetPdfFromHandle(
  handle: SyncFileHandleLike,
  fallbackName: string
): Promise<{ blob: Blob; fileName: string; sizeBytes: number }> {
  if (typeof handle.getFile !== 'function') {
    throw new Error(`Cannot read "${fallbackName}" from the connected folder handle.`);
  }
  const file = await handle.getFile();
  const fileName =
    sanitizeSingleLineText(
      ('name' in file && typeof (file as File).name === 'string' && (file as File).name) ||
        fallbackName,
      180
    ) || 'document.pdf';

  if (!isPdfFileName(fileName, file.type)) {
    throw new Error(`"${fileName}" does not appear to be a PDF document.`);
  }

  const sizeCheck = validateUploadFileSize(
    fileName,
    file.size,
    MAX_VET_PDF_PREVIEW_BYTES,
    'an offline veterinary PDF'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  const typedBlob =
    file.type === 'application/pdf'
      ? file
      : new Blob([file], { type: 'application/pdf' });

  return {
    blob: typedBlob,
    fileName,
    sizeBytes: file.size,
  };
}
