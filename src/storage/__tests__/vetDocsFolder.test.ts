/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VET_PDF_PREVIEW_BYTES } from '../../domain/healthReference';
import type { SyncDirectoryHandleLike, SyncFileHandleLike } from '../localSyncChannels';
import {
  addCustomPreferredWikiSource,
  addCustomRestrictedWikiSource,
  clearAllVetDocsFolderState,
  connectVetDocsFolder,
  disconnectVetDocsFolder,
  getVetDocsFolderStatus,
  markVetDocsBackedUpNow,
  readAllowedWikiLanguages,
  readLocalVetDocsMeta,
  readPreferredWikiSources,
  readRestrictedWikiSources,
  readVetPdfFromHandle,
  removeCustomPreferredWikiSource,
  removeCustomRestrictedWikiSource,
  saveVetDocsLocationNote,
  scanVetDocsDirectory,
  setAllowedWikiLanguages,
  setVetDocsHandleForTest,
  setVetDocsReminderIntervalDays,
  snoozeVetDocsBackupReminder,
  subscribeAllowedWikiLanguagesChange,
  subscribePreferredWikiSourcesChange,
  subscribeRestrictedWikiSourcesChange,
  subscribeVetDocsMetaChange,
} from '../vetDocsFolder';

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function createMockPdfFileHandle(
  name: string,
  sizeBytes: number = 128,
  mimeType: string = 'application/pdf'
): SyncFileHandleLike {
  return {
    kind: 'file',
    name,
    async getFile() {
      return {
        name,
        size: sizeBytes,
        type: mimeType,
        lastModified: 1_760_000_000_000,
        slice: () => new Blob(['%PDF-1.4']),
        arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
        text: async () => '%PDF-1.4',
        stream: () => new Blob(['%PDF-1.4']).stream(),
      } as unknown as File;
    },
  };
}

function createMockDirHandle(
  name: string,
  children: Array<[string, SyncFileHandleLike | SyncDirectoryHandleLike]>
): SyncDirectoryHandleLike {
  return {
    kind: 'directory',
    name,
    async queryPermission() {
      return 'granted';
    },
    async requestPermission() {
      return 'granted';
    },
    async *entries(): AsyncIterable<[string, SyncFileHandleLike]> {
      for (const [entryName, handle] of children) {
        yield [entryName, handle as SyncFileHandleLike];
      }
    },
  };
}

describe('vetDocsFolder — read-only PDF folder pointer, bounded scanning & reminder state', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
    setVetDocsHandleForTest(null);
  });

  afterEach(() => {
    setVetDocsHandleForTest(null);
    vi.unstubAllGlobals();
  });

  it('scans PDFs recursively up to depth 2, skips non-PDFs, sorts paths, and respects maxEntries truncation', async () => {
    const tooDeepDir = createMockDirHandle('level3-too-deep', [
      ['hidden-deep.pdf', createMockPdfFileHandle('hidden-deep.pdf', 100)],
    ]);
    const level2Dir = createMockDirHandle('dosage-charts', [
      ['ivermectin.pdf', createMockPdfFileHandle('ivermectin.pdf', 300)],
      ['level3-too-deep', tooDeepDir],
    ]);
    const level1Dir = createMockDirHandle('rabbits', [
      ['gi-stasis.PDF', createMockPdfFileHandle('gi-stasis.PDF', 500)],
      ['notes.docx', createMockPdfFileHandle('notes.docx', 200, 'application/octet-stream')],
      ['dosage-charts', level2Dir],
    ]);
    const rootDir = createMockDirHandle('Barn Vet Docs', [
      ['rabbits', level1Dir],
      ['emergency-contacts.pdf', createMockPdfFileHandle('emergency-contacts.pdf', 250)],
      ['photo.jpg', createMockPdfFileHandle('photo.jpg', 999, 'image/jpeg')],
    ]);

    const fullScan = await scanVetDocsDirectory(rootDir);
    expect(fullScan.truncated).toBe(false);
    expect(fullScan.entries.map((e) => e.relativePath)).toEqual([
      'emergency-contacts.pdf',
      'rabbits/dosage-charts/ivermectin.pdf',
      'rabbits/gi-stasis.PDF',
    ]);
    expect(fullScan.fileHandles.size).toBe(3);

    const cappedScan = await scanVetDocsDirectory(rootDir, { maxEntries: 2 });
    expect(cappedScan.truncated).toBe(true);
    expect(cappedScan.entries).toHaveLength(2);
  });

  it('connects folder handle, saves notes, updates backup confirmation/snooze/cadence, disconnects, and clears all state', async () => {
    const events: string[] = [];
    const unsubscribe = subscribeVetDocsMetaChange((meta) => {
      events.push(meta.folderName ?? meta.folderLocationNote ?? 'cleared');
    });

    const mockRoot = createMockDirHandle('Clinic PDFs', [
      ['rhdv2.pdf', createMockPdfFileHandle('rhdv2.pdf', 1024)],
      ['parasites.pdf', createMockPdfFileHandle('parasites.pdf', 2048)],
    ]);
    setVetDocsHandleForTest(mockRoot);

    const { status, scan } = await connectVetDocsFolder(mockRoot);
    expect(status.hasDirectoryHandle).toBe(true);
    expect(status.permissionState).toBe('granted');
    expect(status.meta.folderName).toBe('Clinic PDFs');
    expect(status.meta.pdfCount).toBe(2);
    expect(scan.entries).toHaveLength(2);

    const updatedNoteMeta = saveVetDocsLocationNote('  /sdcard/Documents/ClinicPDFs  ');
    expect(updatedNoteMeta.folderLocationNote).toBe('/sdcard/Documents/ClinicPDFs');

    const intervalMeta = setVetDocsReminderIntervalDays(14);
    expect(intervalMeta.reminderIntervalDays).toBe(14);

    const ackMeta = markVetDocsBackedUpNow();
    expect(ackMeta.lastBackedUpAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ackMeta.snoozedUntilMs).toBe(0);

    const snoozed = snoozeVetDocsBackupReminder(7, 1_700_000_000_000);
    expect(snoozed.snoozedUntilMs).toBe(1_700_000_000_000 + 7 * 24 * 60 * 60 * 1000);

    // Disconnect keeps the location note if recorded, while clearing folderName & pdfCount
    const afterDisconnect = await disconnectVetDocsFolder();
    expect(afterDisconnect.meta.folderName).toBeNull();
    expect(afterDisconnect.meta.pdfCount).toBeNull();
    expect(afterDisconnect.meta.folderLocationNote).toBe('/sdcard/Documents/ClinicPDFs');

    // Full clear removes everything
    setVetDocsHandleForTest(null);
    await clearAllVetDocsFolderState();
    const afterReset = await getVetDocsFolderStatus();
    expect(readLocalVetDocsMeta().folderLocationNote).toBe('');
    expect(afterReset.meta.folderName).toBeNull();
    expect(afterReset.reminder.level).toBe('unconfigured');

    expect(events.length).toBeGreaterThanOrEqual(5);
    unsubscribe();
  });

  it('rejects oversized or non-PDF handles when reading a preview blob', async () => {
    const oversizedHandle = createMockPdfFileHandle('huge-scan.pdf', MAX_VET_PDF_PREVIEW_BYTES + 1);
    await expect(readVetPdfFromHandle(oversizedHandle, 'huge-scan.pdf')).rejects.toThrow();

    const nonPdfHandle = createMockPdfFileHandle('spreadsheet.csv', 100, 'text/csv');
    await expect(readVetPdfFromHandle(nonPdfHandle, 'spreadsheet.csv')).rejects.toThrow(/PDF/);

    const validHandle = createMockPdfFileHandle('valid-guide.pdf', 512, '');
    const loaded = await readVetPdfFromHandle(validHandle, 'valid-guide.pdf');
    expect(loaded.fileName).toBe('valid-guide.pdf');
    expect(loaded.sizeBytes).toBe(512);
    expect(loaded.blob.type).toBe('application/pdf');
  });

  it('persists custom restricted wiki sources while keeping House Rabbit Society locked as built-in', async () => {
    const initial = readRestrictedWikiSources();
    expect(initial.some((s) => s.name === 'House Rabbit Society' && s.builtIn)).toBe(true);

    const notifications: number[] = [];
    const unsubscribe = subscribeRestrictedWikiSourcesChange((list) => {
      notifications.push(list.length);
    });

    const afterAdd = addCustomRestrictedWikiSource({
      name: 'Unverified Blog',
      domain: 'https://www.unverified-example.org/rabbits',
      reason: 'Contains outdated care claims',
    });
    expect(afterAdd.some((s) => s.name === 'Unverified Blog' && !s.builtIn)).toBe(true);
    expect(readRestrictedWikiSources().find((s) => s.name === 'Unverified Blog')?.domains).toEqual([
      'unverified-example.org',
    ]);

    // Attempting to remove built-in House Rabbit Society does nothing
    const hrsId = initial.find((s) => s.name === 'House Rabbit Society')!.id;
    const afterBuiltInRemoveAttempt = removeCustomRestrictedWikiSource(hrsId);
    expect(afterBuiltInRemoveAttempt.some((s) => s.id === hrsId)).toBe(true);

    // Removing custom source works cleanly
    const customId = afterAdd.find((s) => s.name === 'Unverified Blog')!.id;
    const afterRemove = removeCustomRestrictedWikiSource(customId);
    expect(afterRemove.some((s) => s.id === customId)).toBe(false);
    expect(afterRemove.some((s) => s.id === hrsId)).toBe(true);

    // Factory reset clears custom restricted sources but retains House Rabbit Society
    addCustomRestrictedWikiSource({ name: 'Another Custom Source', domain: 'another.example.com' });
    await clearAllVetDocsFolderState();
    const afterClear = readRestrictedWikiSources();
    expect(afterClear).toHaveLength(1);
    expect(afterClear[0].name).toBe('House Rabbit Society');

    expect(notifications.length).toBeGreaterThanOrEqual(3);
    unsubscribe();
  });

  it('persists custom preferred wiki sources and multi-language wiki filters while locking built-in entries', async () => {
    const initialPreferred = readPreferredWikiSources();
    expect(initialPreferred.some((p) => p.name === 'Merck Veterinary Manual' && p.builtIn)).toBe(
      true
    );

    const prefCounts: number[] = [];
    const unsubPref = subscribePreferredWikiSourcesChange((list) => prefCounts.push(list.length));

    const afterAddPref = addCustomPreferredWikiSource({
      name: 'Texas A&M AgriLife Extension',
      domain: 'https://agrilifeextension.tamu.edu/',
    });
    const customPref = afterAddPref.find((p) => p.name === 'Texas A&M AgriLife Extension');
    expect(customPref?.builtIn).toBe(false);
    expect(customPref?.domains).toEqual(['agrilifeextension.tamu.edu']);

    const merckId = initialPreferred.find((p) => p.name === 'Merck Veterinary Manual')!.id;
    expect(removeCustomPreferredWikiSource(merckId).some((p) => p.id === merckId)).toBe(true);
    expect(
      removeCustomPreferredWikiSource(customPref!.id).some((p) => p.id === customPref!.id)
    ).toBe(false);

    // Allowed wiki languages default to ['en'] and support multiple languages at once
    expect(readAllowedWikiLanguages()).toEqual(['en']);
    const langUpdates: string[][] = [];
    const unsubLang = subscribeAllowedWikiLanguagesChange((langs) => langUpdates.push(langs));
    expect(setAllowedWikiLanguages(['en-US', 'es', 'fr-CA'])).toEqual(['en-US', 'es', 'fr-CA']);
    expect(readAllowedWikiLanguages()).toEqual(['en-US', 'es', 'fr-CA']);

    await clearAllVetDocsFolderState();
    expect(readAllowedWikiLanguages()).toEqual(['en']);
    expect(readPreferredWikiSources().every((p) => p.builtIn)).toBe(true);
    expect(prefCounts.length).toBeGreaterThanOrEqual(2);
    expect(langUpdates.length).toBeGreaterThanOrEqual(2);

    unsubPref();
    unsubLang();
  });
});
