/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Health Reference Wiki Links, Local Veterinary PDF Folder Pointer &
 * External Document-Folder Backup Reminder Panel (`HealthReferencePanel` & `HealthReferenceModal`).
 *
 * Lazy-loaded to keep cold-start bundle weight minimal. Enforces read-only folder
 * access, revokes all temporary PDF Object URLs on close/switch/unmount, keeps
 * unsupported folder-picker controls visible and disabled with explanation (`IMP-019`),
 * and uses zero-pill typographic hierarchy.
 */

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HeartPulse,
  Plus,
  RefreshCw,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ALLOWED_VET_DOCS_REMINDER_INTERVALS,
  evaluateVetDocsBackupReminder,
  filterAndSortVetPdfEntries,
  findMatchingPreferredWikiSource,
  findMatchingRestrictedWikiSource,
  getHealthWikiLinksForSpecies,
  HealthWikiReference,
  isPdfFileName,
  MAX_VET_PDF_PREVIEW_BYTES,
  PreferredWikiSource,
  RestrictedWikiSource,
  VetDocFileEntry,
  VetDocsReminderIntervalDays,
} from '../core/healthReference';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { validateUploadFileSize } from '../core/inputSanitization';
import { APP_LOCALE } from '../core/models';
import { pedigreeBridge } from '../native/pedigreeBridge';
import { SyncFileHandleLike } from '../storage/localSyncChannels';
import { useConnectivityStatus } from '../storage/storageProtection';
import {
  addCustomPreferredWikiSource,
  addCustomRestrictedWikiSource,
  connectVetDocsFolder,
  disconnectVetDocsFolder,
  getVetDocsFolderStatus,
  markVetDocsBackedUpNow,
  readAllowedWikiLanguages,
  readPreferredWikiSources,
  readRestrictedWikiSources,
  readVetPdfFromHandle,
  reauthorizeVetDocsFolder,
  refreshVetDocsFolderScan,
  removeCustomPreferredWikiSource,
  removeCustomRestrictedWikiSource,
  saveVetDocsLocationNote,
  setVetDocsReminderIntervalDays,
  snoozeVetDocsBackupReminder,
  subscribeAllowedWikiLanguagesChange,
  subscribePreferredWikiSourcesChange,
  subscribeRestrictedWikiSourcesChange,
  subscribeVetDocsMetaChange,
  VetDocsFolderStatus,
} from '../storage/vetDocsFolder';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadBlobDirect } from '../utils/webFileActions';

interface ActivePdfPreview {
  id: string;
  fileName: string;
  sizeBytes: number;
  objectUrl: string;
  blob: Blob;
}

export interface HealthReferencePanelProps {
  speciesName: string;
  initialSection?: 'all' | 'wikis' | 'pdfs';
  onStatusNotice?: (msg: string) => void;
}

export function HealthReferencePanel({
  speciesName,
  initialSection = 'all',
  onStatusNotice,
}: HealthReferencePanelProps) {
  const headingId = useId();
  const folderDisabledReasonId = useId();
  const noteInputId = useId();
  const preferredNameInputId = useId();
  const preferredDomainInputId = useId();
  const preferredDescInputId = useId();
  const restrictedNameInputId = useId();
  const restrictedDomainInputId = useId();
  const restrictedReasonInputId = useId();
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  const connectivity = useConnectivityStatus();
  const isOnline = connectivity.isEffectivelyOnline;

  const [wikiScope, setWikiScope] = useState<'species' | 'all'>('species');
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(() =>
    readAllowedWikiLanguages()
  );
  const [preferredSources, setPreferredSources] = useState<PreferredWikiSource[]>(() =>
    readPreferredWikiSources()
  );
  const [showPreferredSources, setShowPreferredSources] = useState(false);
  const [preferredNameDraft, setPreferredNameDraft] = useState('');
  const [preferredDomainDraft, setPreferredDomainDraft] = useState('');
  const [preferredDescDraft, setPreferredDescDraft] = useState('');
  const [restrictedSources, setRestrictedSources] = useState<RestrictedWikiSource[]>(() =>
    readRestrictedWikiSources()
  );
  const [showRestrictedSources, setShowRestrictedSources] = useState(false);
  const [restrictedNameDraft, setRestrictedNameDraft] = useState('');
  const [restrictedDomainDraft, setRestrictedDomainDraft] = useState('');
  const [restrictedReasonDraft, setRestrictedReasonDraft] = useState('');
  const [status, setStatus] = useState<VetDocsFolderStatus | null>(null);
  const [folderEntries, setFolderEntries] = useState<VetDocFileEntry[]>([]);
  const [pickedEntries, setPickedEntries] = useState<VetDocFileEntry[]>([]);
  const [scanTruncated, setScanTruncated] = useState(false);
  const [pdfQuery, setPdfQuery] = useState('');
  const [locationNoteDraft, setLocationNoteDraft] = useState('');
  const [noteDirty, setNoteDirty] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ActivePdfPreview | null>(null);

  const handleMapRef = useRef<Map<string, SyncFileHandleLike>>(new Map());
  const pickedFileMapRef = useRef<Map<string, File>>(new Map());
  const activePreviewUrlRef = useRef<string | null>(null);

  const folderLock = useAsyncSubmitLock();
  const pdfOpenLock = useAsyncSubmitLock();

  const revokePreview = useCallback(() => {
    if (activePreviewUrlRef.current) {
      try {
        URL.revokeObjectURL(activePreviewUrlRef.current);
      } catch {
        // Ignore URL revoke failure
      }
      activePreviewUrlRef.current = null;
    }
    setPreview(null);
  }, []);

  useEffect(() => {
    return () => {
      if (activePreviewUrlRef.current) {
        try {
          URL.revokeObjectURL(activePreviewUrlRef.current);
        } catch {
          // Ignore URL revoke failure
        }
        activePreviewUrlRef.current = null;
      }
      handleMapRef.current.clear();
      pickedFileMapRef.current.clear();
    };
  }, []);

  const loadFolderAndScan = useCallback(async () => {
    try {
      const currentStatus = await getVetDocsFolderStatus();
      setStatus(currentStatus);
      setLocationNoteDraft((prev) =>
        noteDirty ? prev : currentStatus.meta.folderLocationNote || ''
      );
      if (
        currentStatus.supported &&
        currentStatus.hasDirectoryHandle &&
        currentStatus.permissionState === 'granted'
      ) {
        const refreshed = await refreshVetDocsFolderScan();
        setStatus(refreshed.status);
        if (refreshed.scan) {
          handleMapRef.current = refreshed.scan.fileHandles;
          setFolderEntries(refreshed.scan.entries);
          setScanTruncated(refreshed.scan.truncated);
        }
      }
    } catch (err: unknown) {
      setPanelError(
        err instanceof Error ? err.message : 'Could not check local veterinary PDF folder.'
      );
    }
  }, [noteDirty]);

  useEffect(() => {
    void loadFolderAndScan();
    const unsubscribeMeta = subscribeVetDocsMetaChange((nextMeta) => {
      setStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          meta: nextMeta,
          reminder: evaluateVetDocsBackupReminder(
            nextMeta,
            Date.now(),
            prev.hasDirectoryHandle
          ),
        };
      });
    });
    const unsubscribeRestricted = subscribeRestrictedWikiSourcesChange((nextSources) => {
      setRestrictedSources(nextSources);
    });
    const unsubscribePreferred = subscribePreferredWikiSourcesChange((nextSources) => {
      setPreferredSources(nextSources);
    });
    const unsubscribeLanguages = subscribeAllowedWikiLanguagesChange((nextLanguages) => {
      setAllowedLanguages(nextLanguages);
    });
    return () => {
      unsubscribeMeta();
      unsubscribeRestricted();
      unsubscribePreferred();
      unsubscribeLanguages();
    };
  }, [loadFolderAndScan]);

  const wikiGroups = useMemo(
    () =>
      getHealthWikiLinksForSpecies(speciesName, {
        restrictedSources,
        allowedLanguages,
        preferredSources,
      }),
    [speciesName, restrictedSources, allowedLanguages, preferredSources]
  );

  const visibleWikis: HealthWikiReference[] = useMemo(() => {
    if (wikiScope === 'all') {
      return [
        ...wikiGroups.speciesMatches,
        ...wikiGroups.generalReferences,
        ...wikiGroups.otherSpeciesReferences,
      ];
    }
    return [...wikiGroups.speciesMatches, ...wikiGroups.generalReferences];
  }, [wikiGroups, wikiScope]);

  const combinedPdfEntries = useMemo(() => {
    return filterAndSortVetPdfEntries([...folderEntries, ...pickedEntries], pdfQuery);
  }, [folderEntries, pickedEntries, pdfQuery]);

  const handleOpenWiki = (ref: HealthWikiReference) => {
    setPanelError(null);
    const matchedRestriction = findMatchingRestrictedWikiSource(ref, restrictedSources);
    if (matchedRestriction) {
      setPanelError(
        `Blocked external wiki link "${ref.title}" because "${matchedRestriction.name}" is on the restricted sources list.`
      );
      return;
    }
    const opened = pedigreeBridge.openExternalUrl(ref.url, 'health_wiki');
    if (!opened) {
      setPanelError(`Could not open external link for "${ref.title}".`);
    }
  };

  const handleAddRestrictedSource = (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    const cleanName = restrictedNameDraft.trim();
    const cleanDomain = restrictedDomainDraft.trim();
    if (!cleanName && !cleanDomain) {
      setPanelError('Enter a restricted source name or domain (e.g., example.org).');
      return;
    }
    const next = addCustomRestrictedWikiSource({
      name: cleanName || cleanDomain,
      domain: cleanDomain,
      reason: restrictedReasonDraft.trim(),
    });
    setRestrictedSources(next);
    setRestrictedNameDraft('');
    setRestrictedDomainDraft('');
    setRestrictedReasonDraft('');
    onStatusNotice?.(`Restricted wiki source "${cleanName || cleanDomain}" added.`);
  };

  const handleRemoveRestrictedSource = (source: RestrictedWikiSource) => {
    if (source.builtIn) return;
    setPanelError(null);
    const next = removeCustomRestrictedWikiSource(source.id);
    setRestrictedSources(next);
    onStatusNotice?.(`Removed "${source.name}" from custom restricted wiki sources.`);
  };

  const handleAddPreferredSource = (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    const cleanName = preferredNameDraft.trim();
    const cleanDomain = preferredDomainDraft.trim();
    if (!cleanName && !cleanDomain) {
      setPanelError('Enter a preferred source name or domain (e.g., extension.umn.edu).');
      return;
    }
    const isSuffix = cleanDomain.startsWith('.');
    const next = addCustomPreferredWikiSource({
      name: cleanName || cleanDomain,
      domain: isSuffix ? undefined : cleanDomain,
      domainSuffix: isSuffix ? cleanDomain : undefined,
      description: preferredDescDraft.trim(),
    });
    setPreferredSources(next);
    setPreferredNameDraft('');
    setPreferredDomainDraft('');
    setPreferredDescDraft('');
    onStatusNotice?.(`Preferred wiki source "${cleanName || cleanDomain}" added.`);
  };

  const handleRemovePreferredSource = (source: PreferredWikiSource) => {
    if (source.builtIn) return;
    setPanelError(null);
    const next = removeCustomPreferredWikiSource(source.id);
    setPreferredSources(next);
    onStatusNotice?.(`Removed "${source.name}" from custom preferred wiki sources.`);
  };

  const handleConnectFolder = () =>
    folderLock.runLocked(async () => {
      setPanelError(null);
      try {
        const { status: nextStatus, scan } = await connectVetDocsFolder();
        handleMapRef.current = scan.fileHandles;
        setFolderEntries(scan.entries);
        setScanTruncated(scan.truncated);
        setStatus(nextStatus);
        onStatusNotice?.(
          `Connected local vet PDF folder "${nextStatus.meta.folderName || 'Veterinary PDFs'}" (${scan.entries.length} PDF${scan.entries.length === 1 ? '' : 's'}).`
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setPanelError(
          err instanceof Error ? err.message : 'Could not connect veterinary PDF folder.'
        );
      }
    });

  const handleReauthorizeFolder = () =>
    folderLock.runLocked(async () => {
      setPanelError(null);
      try {
        const { status: nextStatus, scan } = await reauthorizeVetDocsFolder();
        setStatus(nextStatus);
        if (scan) {
          handleMapRef.current = scan.fileHandles;
          setFolderEntries(scan.entries);
          setScanTruncated(scan.truncated);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPanelError(err instanceof Error ? err.message : 'Folder permission request failed.');
      }
    });

  const handleRefreshScan = () =>
    folderLock.runLocked(async () => {
      setPanelError(null);
      try {
        const { status: nextStatus, scan } = await refreshVetDocsFolderScan();
        setStatus(nextStatus);
        if (scan) {
          handleMapRef.current = scan.fileHandles;
          setFolderEntries(scan.entries);
          setScanTruncated(scan.truncated);
        }
      } catch (err: unknown) {
        setPanelError(err instanceof Error ? err.message : 'Could not refresh PDF folder list.');
      }
    });

  const handleDisconnectFolder = () =>
    folderLock.runLocked(async () => {
      setPanelError(null);
      revokePreview();
      handleMapRef.current.clear();
      setFolderEntries([]);
      setScanTruncated(false);
      const nextStatus = await disconnectVetDocsFolder();
      setStatus(nextStatus);
      onStatusNotice?.('Disconnected local veterinary PDF folder pointer.');
    });

  const handleSaveLocationNote = (e: React.FormEvent) => {
    e.preventDefault();
    setPanelError(null);
    const updated = saveVetDocsLocationNote(locationNoteDraft);
    setLocationNoteDraft(updated.folderLocationNote);
    setNoteDirty(false);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            meta: updated,
            reminder: evaluateVetDocsBackupReminder(updated, Date.now(), prev.hasDirectoryHandle),
          }
        : prev
    );
    onStatusNotice?.(
      updated.folderLocationNote
        ? 'Saved local veterinary PDF folder location note.'
        : 'Cleared local veterinary PDF folder location note.'
    );
  };

  const handlePickedPdfFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPanelError(null);
    const added: VetDocFileEntry[] = [];
    const skipped: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      if (!isPdfFileName(f.name, f.type)) {
        skipped.push(`${f.name} (not a PDF)`);
        continue;
      }
      const sizeCheck = validateUploadFileSize(
        f.name,
        f.size,
        MAX_VET_PDF_PREVIEW_BYTES,
        'a veterinary PDF'
      );
      if (!sizeCheck.ok) {
        skipped.push(sizeCheck.error);
        continue;
      }
      const id = `picked:${f.name}:${f.size}:${f.lastModified}`;
      pickedFileMapRef.current.set(id, f);
      if (!pickedEntries.some((item) => item.id === id) && !added.some((item) => item.id === id)) {
        added.push({
          id,
          name: f.name,
          relativePath: f.name,
          sizeBytes: f.size,
          lastModifiedMs: f.lastModified || 0,
          source: 'picked_file',
        });
      }
    }

    if (added.length > 0) {
      setPickedEntries((prev) => [...prev, ...added]);
    }
    if (skipped.length > 0) {
      setPanelError(skipped.slice(0, 2).join(' '));
    }
    if (pdfFileInputRef.current) {
      pdfFileInputRef.current.value = '';
    }
  };

  const handlePreviewEntry = (entry: VetDocFileEntry) =>
    pdfOpenLock.runLocked(async () => {
      setPanelError(null);
      try {
        let blob: Blob;
        let fileName = entry.name;
        let sizeBytes = entry.sizeBytes;

        if (entry.source === 'folder_handle') {
          const fileHandle = handleMapRef.current.get(entry.id);
          if (!fileHandle) {
            throw new Error(
              'PDF file handle is unavailable. Click "Refresh List" to re-scan the folder.'
            );
          }
          const loaded = await readVetPdfFromHandle(fileHandle, entry.name);
          blob = loaded.blob;
          fileName = loaded.fileName;
          sizeBytes = loaded.sizeBytes;
        } else {
          const picked = pickedFileMapRef.current.get(entry.id);
          if (!picked) {
            throw new Error('Selected file is no longer cached in this browser session.');
          }
          blob =
            picked.type === 'application/pdf'
              ? picked
              : new Blob([picked], { type: 'application/pdf' });
          sizeBytes = picked.size;
        }

        const nextUrl = URL.createObjectURL(blob);
        if (activePreviewUrlRef.current) {
          try {
            URL.revokeObjectURL(activePreviewUrlRef.current);
          } catch {
            // Ignore revoke error
          }
        }
        activePreviewUrlRef.current = nextUrl;
        setPreview({
          id: entry.id,
          fileName,
          sizeBytes,
          objectUrl: nextUrl,
          blob,
        });
      } catch (err: unknown) {
        setPanelError(err instanceof Error ? err.message : 'Could not open PDF document.');
      }
    });

  const handleDownloadPreviewedPdf = async () => {
    if (!preview) return;
    setPanelError(null);
    try {
      await downloadBlobDirect(preview.fileName, preview.blob);
    } catch (err: unknown) {
      setPanelError(err instanceof Error ? err.message : 'Could not save PDF copy.');
    }
  };

  const handleMarkBackedUpToday = () => {
    setPanelError(null);
    const updated = markVetDocsBackedUpNow();
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            meta: updated,
            reminder: evaluateVetDocsBackupReminder(updated, Date.now(), prev.hasDirectoryHandle),
          }
        : prev
    );
    onStatusNotice?.('Recorded external veterinary PDF folder backup date.');
  };

  const handleSnooze7Days = () => {
    setPanelError(null);
    const updated = snoozeVetDocsBackupReminder(7);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            meta: updated,
            reminder: evaluateVetDocsBackupReminder(updated, Date.now(), prev.hasDirectoryHandle),
          }
        : prev
    );
  };

  const handleIntervalChange = (days: VetDocsReminderIntervalDays) => {
    setPanelError(null);
    const updated = setVetDocsReminderIntervalDays(days);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            meta: updated,
            reminder: evaluateVetDocsBackupReminder(updated, Date.now(), prev.hasDirectoryHandle),
          }
        : prev
    );
  };

  const totalWikiCount =
    wikiGroups.speciesMatches.length +
    wikiGroups.generalReferences.length +
    wikiGroups.otherSpeciesReferences.length;

  return (
    <div aria-labelledby={headingId} className="space-y-6 text-[var(--barn-ink)]">
      {/* Header Summary */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h2 id={headingId} className="font-display text-lg font-semibold flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Health Reference Wikis &amp; Offline Veterinary PDFs</span>
          </h2>
          <p className="text-xs text-[var(--barn-muted)]">
            Curated online veterinary manuals for {speciesName} alongside a read-only local device
            folder pointer for your personal offline veterinary PDFs.
          </p>
        </div>

        <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums whitespace-nowrap">
          {isOnline ? 'Online links ready' : 'Offline mode · local PDFs ready'}
        </div>
      </div>

      {panelError && (
        <div
          role="alert"
          className="px-3.5 py-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex items-start justify-between gap-2"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="break-words">{panelError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPanelError(null)}
            aria-label="Dismiss error"
            className="text-[11px] underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Section 1: Curated External Health Wiki Links */}
      {initialSection !== 'pdfs' && (
        <section className="space-y-3 border-t border-[var(--barn-border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Curated Health Reference Wikis</span>
              </h3>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Authoritative veterinary references · Required language:{' '}
                <span className="font-mono">{allowedLanguages.join(', ')}</span> (App:{' '}
                <span className="font-mono">{APP_LOCALE}</span>) · Opens in external browser
              </p>
            </div>

            <div
              role="group"
              aria-label="Filter health reference wikis by species"
              className="inline-flex items-center p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
            >
              <button
                type="button"
                aria-pressed={wikiScope === 'species'}
                onClick={() => setWikiScope('species')}
                className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                  wikiScope === 'species'
                    ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] shadow-sm font-semibold'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {speciesName} &amp; General (
                {wikiGroups.speciesMatches.length + wikiGroups.generalReferences.length})
              </button>
              <button
                type="button"
                aria-pressed={wikiScope === 'all'}
                onClick={() => setWikiScope('all')}
                className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                  wikiScope === 'all'
                    ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] shadow-sm font-semibold'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                All Species ({totalWikiCount})
              </button>
            </div>
          </div>

          {!isOnline && (
            <div className="px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
              <span>
                You appear offline. External wiki links require an internet connection; use your
                local Veterinary PDF folder below for offline manuals.
              </span>
            </div>
          )}

          <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
            {visibleWikis.map((ref) => {
              const preferredMatch = findMatchingPreferredWikiSource(
                ref,
                preferredSources,
                restrictedSources
              );
              return (
                <div
                  key={ref.id}
                  className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">
                      {ref.title}
                    </div>
                    <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span>{ref.source}</span>
                      {preferredMatch && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[var(--barn-sage)]">
                            Preferred ({preferredMatch.categoryLabel})
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{ref.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ref.speciesTags.join(', ')}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{ref.language}</span>
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">{ref.summary}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenWiki(ref)}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Open Guide</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Preferred Wiki Article Sources */}
          <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] overflow-hidden">
            <button
              type="button"
              aria-expanded={showPreferredSources}
              onClick={() => setShowPreferredSources((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--barn-subtle)] transition-colors"
            >
              <span className="text-xs font-semibold flex items-center gap-1.5 min-w-0">
                <ShieldCheck
                  className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  Preferred Wiki Sources ({preferredSources.length})
                </span>
              </span>
              <span className="text-[11px] text-[var(--barn-muted)] inline-flex items-center gap-1 shrink-0">
                <span>{showPreferredSources ? 'Hide' : 'Manage'}</span>
                {showPreferredSources ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </span>
            </button>

            {showPreferredSources && (
              <div className="border-t border-[var(--barn-border)] px-3.5 py-3 space-y-3 bg-[var(--barn-surface)]">
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Preferred sources are prioritized first for each species. Only sources matching
                  required wiki languages (<span className="font-mono">{allowedLanguages.join(', ')}</span>)
                  and not on the restricted list are shown.
                </p>

                <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-lg bg-[var(--barn-canvas)]">
                  {preferredSources.map((src) => (
                    <div
                      key={src.id}
                      className="px-3 py-2 flex items-start justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{src.name}</span>
                          {src.builtIn && (
                            <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--barn-sage)]">
                              Built-in
                            </span>
                          )}
                        </div>
                        {(src.domains.length > 0 || src.domainSuffixes.length > 0) && (
                          <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate">
                            {[...src.domains.slice(0, 4), ...src.domainSuffixes.slice(0, 4)].join(
                              ', '
                            )}
                            {src.domains.length + src.domainSuffixes.length > 8 ? ' ...' : ''}
                          </div>
                        )}
                        <p className="text-[11px] text-[var(--barn-muted)]">{src.description}</p>
                      </div>

                      {!src.builtIn && (
                        <button
                          type="button"
                          onClick={() => handleRemovePreferredSource(src)}
                          aria-label={`Remove ${src.name} from preferred wiki sources`}
                          className="min-h-[32px] px-2.5 py-1 rounded-md border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] whitespace-nowrap shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleAddPreferredSource}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end pt-1"
                >
                  <div className="space-y-1">
                    <label
                      htmlFor={preferredNameInputId}
                      className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                    >
                      Preferred Source Name
                    </label>
                    <input
                      id={preferredNameInputId}
                      type="text"
                      maxLength={140}
                      placeholder="e.g. University of Guelph"
                      value={preferredNameDraft}
                      onChange={(e) => setPreferredNameDraft(e.target.value)}
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={preferredDomainInputId}
                      className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                    >
                      Domain or Suffix (optional)
                    </label>
                    <input
                      id={preferredDomainInputId}
                      type="text"
                      maxLength={160}
                      placeholder="e.g. uoguelph.ca or .edu"
                      value={preferredDomainDraft}
                      onChange={(e) => setPreferredDomainDraft(e.target.value)}
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <label
                        htmlFor={preferredDescInputId}
                        className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                      >
                        Note (optional)
                      </label>
                      <input
                        id={preferredDescInputId}
                        type="text"
                        maxLength={220}
                        placeholder="Why preferred"
                        value={preferredDescDraft}
                        onChange={(e) => setPreferredDescDraft(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Prefer</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Restricted Wiki Article Sources */}
          <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] overflow-hidden">
            <button
              type="button"
              aria-expanded={showRestrictedSources}
              onClick={() => setShowRestrictedSources((prev) => !prev)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-[var(--barn-subtle)] transition-colors"
            >
              <span className="text-xs font-semibold flex items-center gap-1.5 min-w-0">
                <ShieldBan
                  className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  Restricted Wiki Sources ({restrictedSources.length})
                </span>
              </span>
              <span className="text-[11px] text-[var(--barn-muted)] inline-flex items-center gap-1 shrink-0">
                <span>{showRestrictedSources ? 'Hide' : 'Manage'}</span>
                {showRestrictedSources ? (
                  <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </span>
            </button>

            {showRestrictedSources && (
              <div className="border-t border-[var(--barn-border)] px-3.5 py-3 space-y-3 bg-[var(--barn-surface)]">
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Sources listed below are excluded from curated health wiki article connections
                  and blocked from external link launch.
                </p>

                <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-lg bg-[var(--barn-canvas)]">
                  {restrictedSources.map((src) => (
                    <div
                      key={src.id}
                      className="px-3 py-2 flex items-start justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>{src.name}</span>
                          {src.domains.length > 0 && (
                            <span className="text-[11px] font-mono text-[var(--barn-muted)] font-normal">
                              {src.domains.join(', ')}
                            </span>
                          )}
                          {src.builtIn && (
                            <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--barn-muted)]">
                              Built-in
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--barn-muted)]">{src.reason}</p>
                      </div>

                      {!src.builtIn && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRestrictedSource(src)}
                          aria-label={`Remove ${src.name} from restricted wiki sources`}
                          className="min-h-[32px] px-2.5 py-1 rounded-md border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] whitespace-nowrap shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={handleAddRestrictedSource}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end pt-1"
                >
                  <div className="space-y-1">
                    <label
                      htmlFor={restrictedNameInputId}
                      className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                    >
                      Source Name
                    </label>
                    <input
                      id={restrictedNameInputId}
                      type="text"
                      maxLength={120}
                      placeholder="e.g. Example Pet Blog"
                      value={restrictedNameDraft}
                      onChange={(e) => setRestrictedNameDraft(e.target.value)}
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={restrictedDomainInputId}
                      className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                    >
                      Domain (optional)
                    </label>
                    <input
                      id={restrictedDomainInputId}
                      type="text"
                      maxLength={160}
                      placeholder="e.g. example.org"
                      value={restrictedDomainDraft}
                      onChange={(e) => setRestrictedDomainDraft(e.target.value)}
                      className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <label
                        htmlFor={restrictedReasonInputId}
                        className="text-[11px] font-semibold text-[var(--barn-muted)] block"
                      >
                        Reason (optional)
                      </label>
                      <input
                        id={restrictedReasonInputId}
                        type="text"
                        maxLength={220}
                        placeholder="Why restricted"
                        value={restrictedReasonDraft}
                        onChange={(e) => setRestrictedReasonDraft(e.target.value)}
                        className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Restrict</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 2: Local Veterinary PDF Folder Pointer */}
      {initialSection !== 'wikis' && (
        <section className="space-y-4 border-t border-[var(--barn-border)] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-0.5 min-w-0 flex-1">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Local Veterinary PDF Folder Pointer (Offline)</span>
              </h3>
              <p id={folderDisabledReasonId} className="text-[11px] text-[var(--barn-muted)]">
                {!status
                  ? 'Checking folder pointer availability...'
                  : !status.supported
                    ? 'Disabled: Persistent folder pointers (showDirectoryPicker) are unavailable in this browser (e.g., iOS Safari or Firefox). Save a folder path note or pick PDF files directly below for offline viewing.'
                    : status.hasDirectoryHandle
                      ? `Connected read-only to "${status.meta.folderName || 'Veterinary PDFs'}" · Files stay on your device and are never modified or copied into barn exports.`
                      : 'Point Pedigree to a local device folder holding Merck/extension PDFs, vet instructions, or lab reports for quick offline access.'}
              </p>
              {status?.supported && status.hasDirectoryHandle && (
                <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] pt-0.5">
                  Permission:{' '}
                  <span className="text-[var(--barn-ink)] font-semibold">
                    {status.permissionState === 'granted'
                      ? 'Ready (read-only)'
                      : status.permissionState === 'prompt'
                        ? 'Needs re-authorization'
                        : status.permissionState}
                  </span>
                  {status.meta.pdfCount !== null ? ` · ${status.meta.pdfCount} PDF(s)` : ''}
                  {status.meta.lastScannedAtIso
                    ? ` · Scanned ${new Date(status.meta.lastScannedAtIso).toLocaleDateString()}`
                    : ''}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {status?.hasDirectoryHandle && status.supported ? (
                <>
                  {status.permissionState !== 'granted' && (
                    <button
                      type="button"
                      disabled={folderLock.isSubmitting}
                      onClick={() => void handleReauthorizeFolder()}
                      className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                    >
                      Re-authorize Read Access
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={folderLock.isSubmitting}
                    onClick={() => void handleRefreshScan()}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Refresh List</span>
                  </button>
                  <button
                    type="button"
                    disabled={folderLock.isSubmitting}
                    onClick={() => void handleDisconnectFolder()}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Disconnect</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!status?.supported || folderLock.isSubmitting}
                  aria-describedby={folderDisabledReasonId}
                  onClick={() => void handleConnectFolder()}
                  className="min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {folderLock.isSubmitting ? 'Opening Picker...' : 'Connect Vet PDF Folder'}
                  </span>
                </button>
              )}

              <input
                ref={pdfFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                aria-label="Open local veterinary PDF files directly"
                onChange={(e) => handlePickedPdfFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => pdfFileInputRef.current?.click()}
                className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Open PDF File(s)</span>
              </button>
            </div>
          </div>

          {/* Cross-Browser Folder Location Note */}
          <form
            onSubmit={handleSaveLocationNote}
            className="flex flex-col sm:flex-row sm:items-end gap-2 pt-1"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <label
                htmlFor={noteInputId}
                className="text-[11px] font-semibold text-[var(--barn-muted)] block"
              >
                Device Folder Path / Location Note (cross-browser reference)
              </label>
              <input
                id={noteInputId}
                type="text"
                maxLength={180}
                placeholder="e.g. Files > On My iPad > Barn Vet PDFs  or  D:\Livestock\Vet-Guides"
                value={locationNoteDraft}
                onChange={(e) => {
                  setLocationNoteDraft(e.target.value);
                  setNoteDirty(true);
                }}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="submit"
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold whitespace-nowrap"
              >
                Save Path Note
              </button>
              {status?.meta.folderLocationNote && (
                <button
                  type="button"
                  onClick={() => {
                    setLocationNoteDraft('');
                    setNoteDirty(false);
                    const updated = saveVetDocsLocationNote('');
                    setStatus((prev) =>
                      prev
                        ? {
                            ...prev,
                            meta: updated,
                            reminder: evaluateVetDocsBackupReminder(
                              updated,
                              Date.now(),
                              prev.hasDirectoryHandle
                            ),
                          }
                        : prev
                    );
                  }}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Scanned / Picked PDF List */}
          {(folderEntries.length > 0 || pickedEntries.length > 0) && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search
                    className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    aria-label="Filter local veterinary PDFs"
                    placeholder="Search PDF filenames or subfolders..."
                    value={pdfQuery}
                    onChange={(e) => setPdfQuery(e.target.value)}
                    className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                  Showing {combinedPdfEntries.length} PDF{combinedPdfEntries.length === 1 ? '' : 's'}
                  {scanTruncated ? ' (capped at 250 files)' : ''}
                </span>
              </div>

              {combinedPdfEntries.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)] py-2">
                  No PDF filenames matched &ldquo;{pdfQuery}&rdquo;.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
                  {combinedPdfEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex items-start gap-2">
                        <FileText
                          className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate text-[var(--barn-ink)]">
                            {entry.name}
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums truncate">
                            {entry.relativePath !== entry.name ? `${entry.relativePath} · ` : ''}
                            {formatByteSizePure(entry.sizeBytes)}
                            {entry.lastModifiedMs > 0
                              ? ` · ${new Date(entry.lastModifiedMs).toLocaleDateString()}`
                              : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={pdfOpenLock.isSubmitting}
                        onClick={() => void handlePreviewEntry(entry)}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50"
                      >
                        {preview?.id === entry.id ? 'Viewing' : 'Open PDF'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inline PDF Preview Box (revokes Object URL on close/unmount) */}
          {preview && (
            <div className="border border-[var(--barn-sage)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-surface)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{preview.fileName}</div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    {formatByteSizePure(preview.sizeBytes)} · Local read-only preview
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleDownloadPreviewedPdf()}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save / Share Copy</span>
                  </button>
                  <button
                    type="button"
                    onClick={revokePreview}
                    aria-label="Close PDF preview"
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Close</span>
                  </button>
                </div>
              </div>
              <iframe
                title={`PDF preview: ${preview.fileName}`}
                src={preview.objectUrl}
                className="w-full h-[380px] bg-white"
              />
            </div>
          )}

          {/* Section 3: Periodic External Document Folder Backup Reminder */}
          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  {status?.reminder.needsReminder ? (
                    <AlertTriangle
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    {status?.reminder.headline || 'External Document Folder Backup Reminder'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  {status?.reminder.detail ||
                    'External PDF folders remain outside Pedigree .ZIP backups; set a reminder interval to back them up separately.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!status?.reminder.isConfigured}
                  onClick={handleMarkBackedUpToday}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Mark Backed Up Today
                </button>
                {status?.reminder.showBanner && (
                  <button
                    type="button"
                    onClick={handleSnooze7Days}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium whitespace-nowrap"
                  >
                    Snooze 7d
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[11px] text-[var(--barn-muted)]">
                Reminder cadence for external vet folder backups:
              </span>
              <div
                role="group"
                aria-label="Veterinary folder backup reminder interval"
                className="inline-flex items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              >
                {ALLOWED_VET_DOCS_REMINDER_INTERVALS.map((days) => {
                  const active = (status?.meta.reminderIntervalDays ?? 30) === days;
                  return (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleIntervalChange(days)}
                      className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[var(--barn-surface)] text-[var(--barn-ink)] font-semibold shadow-sm'
                          : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      {days}d
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export interface HealthReferenceModalProps {
  speciesName: string;
  initialSection?: 'all' | 'wikis' | 'pdfs';
  onStatusNotice?: (msg: string) => void;
  onClose: () => void;
}

export function HealthReferenceModal({
  speciesName,
  initialSection = 'all',
  onStatusNotice,
  onClose,
}: HealthReferenceModalProps) {
  const dialogRef = useAccessibleDialog<HTMLDivElement>({
    isOpen: true,
    onClose,
  });

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Health Reference Wikis & Veterinary PDFs for ${speciesName}`}
        tabIndex={-1}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--barn-surface)] border border-[var(--barn-border)] shadow-xl p-5 sm:p-6 space-y-4 focus:outline-none"
      >
        <div className="flex items-center justify-between gap-2 pb-1">
          <span className="text-xs font-mono text-[var(--barn-muted)]">
            {speciesName} Health Library
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close health reference modal"
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <HealthReferencePanel
          speciesName={speciesName}
          initialSection={initialSection}
          onStatusNotice={onStatusNotice}
        />
      </div>
    </div>
  );
}
