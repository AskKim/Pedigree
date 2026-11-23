# Codebase Export: AskKim/Pedigree (Part 4 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 5 (`src/components/EconomicsLedgerScreen.tsx` -> `src/components/FounderAndHeritabilityPanel.tsx`)
- **Index:** [index.md](./index.md)

---
## `src/components/EconomicsLedgerScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Local Economic Ledger, Meat/Pelt Processing Yields & 4-H/FFA Youth Project Books
 * (`src/components/EconomicsLedgerScreen.tsx`).
 *
 * Strictly species-isolated financial, processing harvest, and youth project record-book
 * workspace powered by pure analytics in `src/core/economicsLedger.ts` and persisted
 * offline-first via SQLite/IndexedDB + delta sync.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Camera,
  Check,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  GraduationCap,
  Image as ImageIcon,
  Plus,
  Printer,
  Receipt,
  Scale,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import {
  calculateDressOutPercent,
  computeAnimalProfitMargins,
  computeLitterProfitMargins,
  evaluateProcessingSummary,
  evaluateSpeciesEconomicsSummary,
  evaluateYouthProjectSummary,
  formatEconomicsLedgerCsv,
  formatProcessingLogsCsv,
  generateYouthProjectReportHtml,
  getLedgerCategoryLabel,
} from '../core/economicsLedger';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import { sanitizeSafeRasterImageDataUrl } from '../core/inputSanitization';
import {
  BarnSettings,
  formatCurrencyCents,
  formatReadableDate,
  formatWeight,
  formatWeightInputValue,
  generateUuid,
  getWeightInputMeta,
  LEDGER_CATEGORY_OPTIONS,
  LedgerCategory,
  LedgerEntry,
  LedgerEntryType,
  normalizeCurrencyCode,
  parseWeightInputToGrams,
  PELT_GRADE_OPTIONS,
  PeltGrade,
  ProcessingLog,
  ProcessingStatus,
  resolveSpeciesWeightUnit,
  todayDateIso,
  YOUTH_ORG_OPTIONS,
  YouthOrgType,
  YouthProjectBook,
  YouthProjectFeedLogEntry,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface EconomicsLedgerScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onOpenAnimal: (animalId: string) => void;
  onSaveLedgerEntry: (
    draft: Omit<LedgerEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean>;
  onDeleteLedgerEntry: (id: string) => Promise<void> | void;
  onSaveProcessingLog: (
    draft: Omit<ProcessingLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean>;
  onDeleteProcessingLog: (id: string) => Promise<void> | void;
  onSaveYouthProjectBook: (
    draft: Omit<YouthProjectBook, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean>;
  onDeleteYouthProjectBook: (id: string) => Promise<void> | void;
}

type EconomicsTab = 'ledger' | 'processing' | 'youth';
type LedgerTypeFilter = 'all' | 'expense' | 'income';

interface LedgerFormDraft {
  id?: string;
  dateIso: string;
  entryType: LedgerEntryType;
  category: LedgerCategory;
  amount: string;
  title: string;
  vendorOrParty: string;
  linkedAnimalId: string;
  linkedBreedingId: string;
  linkedFeedBatchId: string;
  linkedProjectId: string;
  receiptPhotoDataUrl?: string;
  receiptPhotoThumbnailDataUrl?: string;
  receiptPhotoMimeType?: string;
  receiptPhotoBytes?: number;
  notes: string;
}

interface ProcessingFormDraft {
  id?: string;
  title: string;
  status: ProcessingStatus;
  scheduledDateIso: string;
  harvestDateIso: string;
  linkedAnimalId: string;
  linkedBreedingId: string;
  animalCount: string;
  liveWeightInput: string;
  dressedWeightInput: string;
  peltCount: string;
  peltGrade: PeltGrade;
  peltColorNotes: string;
  processingCost: string;
  meatValue: string;
  peltValue: string;
  notes: string;
}

interface YouthProjectFormDraft {
  id?: string;
  organization: YouthOrgType;
  projectTitle: string;
  memberName: string;
  clubOrChapter: string;
  leaderOrAdvisor: string;
  projectYear: string;
  startDateIso: string;
  endDateIso: string;
  status: 'Active' | 'Completed';
  linkedAnimalIds: string[];
  linkedBreedingIds: string[];
  startingInventoryValue: string;
  endingInventoryValue: string;
  goalsAndReflection: string;
  showAndCommunityNotes: string;
  notes: string;
}

function parseCurrencyInputToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return 0;
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function formatCentsToInput(cents: number | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return '';
  return (cents / 100).toFixed(2);
}

function makeEmptyLedgerDraft(): LedgerFormDraft {
  return {
    dateIso: todayDateIso(),
    entryType: 'expense',
    category: 'feed',
    amount: '',
    title: '',
    vendorOrParty: '',
    linkedAnimalId: '',
    linkedBreedingId: '',
    linkedFeedBatchId: '',
    linkedProjectId: '',
    notes: '',
  };
}

function ledgerToDraft(entry: LedgerEntry): LedgerFormDraft {
  return {
    id: entry.id,
    dateIso: entry.dateIso || todayDateIso(),
    entryType: entry.entryType,
    category: entry.category,
    amount: formatCentsToInput(entry.amountCents),
    title: entry.title,
    vendorOrParty: entry.vendorOrParty,
    linkedAnimalId: entry.linkedAnimalId || '',
    linkedBreedingId: entry.linkedBreedingId || '',
    linkedFeedBatchId: entry.linkedFeedBatchId || '',
    linkedProjectId: entry.linkedProjectId || '',
    receiptPhotoDataUrl: entry.receiptPhotoDataUrl,
    receiptPhotoThumbnailDataUrl: entry.receiptPhotoThumbnailDataUrl,
    receiptPhotoMimeType: entry.receiptPhotoMimeType,
    receiptPhotoBytes: entry.receiptPhotoBytes,
    notes: entry.notes,
  };
}

function makeEmptyProcessingDraft(): ProcessingFormDraft {
  const today = todayDateIso();
  return {
    title: '',
    status: 'Processed',
    scheduledDateIso: today,
    harvestDateIso: today,
    linkedAnimalId: '',
    linkedBreedingId: '',
    animalCount: '1',
    liveWeightInput: '',
    dressedWeightInput: '',
    peltCount: '0',
    peltGrade: '',
    peltColorNotes: '',
    processingCost: '',
    meatValue: '',
    peltValue: '',
    notes: '',
  };
}

function processingToDraft(
  log: ProcessingLog,
  weightUnit: ReturnType<typeof resolveSpeciesWeightUnit>
): ProcessingFormDraft {
  return {
    id: log.id,
    title: log.title,
    status: log.status,
    scheduledDateIso: log.scheduledDateIso || '',
    harvestDateIso: log.harvestDateIso || '',
    linkedAnimalId: log.linkedAnimalId || '',
    linkedBreedingId: log.linkedBreedingId || '',
    animalCount: String(log.animalCount || 1),
    liveWeightInput: formatWeightInputValue(log.liveWeightGrams, weightUnit),
    dressedWeightInput: formatWeightInputValue(log.dressedWeightGrams, weightUnit),
    peltCount: String(log.peltCount || 0),
    peltGrade: log.peltGrade || '',
    peltColorNotes: log.peltColorNotes || '',
    processingCost: formatCentsToInput(log.processingCostCents),
    meatValue: formatCentsToInput(log.meatValueCents),
    peltValue: formatCentsToInput(log.peltValueCents),
    notes: log.notes || '',
  };
}

function makeEmptyProjectDraft(defaultMemberName: string): YouthProjectFormDraft {
  const today = todayDateIso();
  return {
    organization: '4-H',
    projectTitle: '',
    memberName: defaultMemberName,
    clubOrChapter: '',
    leaderOrAdvisor: '',
    projectYear: today.slice(0, 4),
    startDateIso: today,
    endDateIso: '',
    status: 'Active',
    linkedAnimalIds: [],
    linkedBreedingIds: [],
    startingInventoryValue: '',
    endingInventoryValue: '',
    goalsAndReflection: '',
    showAndCommunityNotes: '',
    notes: '',
  };
}

function projectToDraft(project: YouthProjectBook): YouthProjectFormDraft {
  return {
    id: project.id,
    organization: project.organization,
    projectTitle: project.projectTitle,
    memberName: project.memberName,
    clubOrChapter: project.clubOrChapter,
    leaderOrAdvisor: project.leaderOrAdvisor,
    projectYear: project.projectYear,
    startDateIso: project.startDateIso,
    endDateIso: project.endDateIso,
    status: project.status,
    linkedAnimalIds: [...(project.linkedAnimalIds ?? [])],
    linkedBreedingIds: [...(project.linkedBreedingIds ?? [])],
    startingInventoryValue: formatCentsToInput(project.startingInventoryValueCents),
    endingInventoryValue: formatCentsToInput(project.endingInventoryValueCents),
    goalsAndReflection: project.goalsAndReflection,
    showAndCommunityNotes: project.showAndCommunityNotes,
    notes: project.notes,
  };
}

export function EconomicsLedgerScreen({
  activeData,
  settings,
  onBackToHub,
  onOpenAnimal,
  onSaveLedgerEntry,
  onDeleteLedgerEntry,
  onSaveProcessingLog,
  onDeleteProcessingLog,
  onSaveYouthProjectBook,
  onDeleteYouthProjectBook,
}: EconomicsLedgerScreenProps) {
  const {
    speciesProfile,
    animals,
    herdById,
    breedings,
    feedBatches,
    feedAllocations,
    ledgerEntries,
    processingLogs,
    youthProjectBooks,
  } = activeData;

  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const weightUnit = resolveSpeciesWeightUnit(speciesProfile, settings);
  const weightMeta = getWeightInputMeta(weightUnit);

  const [activeTab, setActiveTab] = useState<EconomicsTab>('ledger');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Tab 1: Ledger filter & editor
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<LedgerTypeFilter>('all');
  const [ledgerCategoryFilter, setLedgerCategoryFilter] = useState<string>('all');
  const [dateFromIso, setDateFromIso] = useState('');
  const [dateToIso, setDateToIso] = useState('');
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [ledgerDraft, setLedgerDraft] = useState<LedgerFormDraft>(makeEmptyLedgerDraft);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [lightboxEntry, setLightboxEntry] = useState<LedgerEntry | null>(null);
  const [confirmDeleteLedgerId, setConfirmDeleteLedgerId] = useState<string | null>(null);
  const [marginSubTab, setMarginSubTab] = useState<'litters' | 'animals'>('litters');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  // Tab 2: Processing Log editor
  const [procStatusFilter, setProcStatusFilter] = useState<'all' | ProcessingStatus>('all');
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [procDraft, setProcDraft] = useState<ProcessingFormDraft>(makeEmptyProcessingDraft);
  const [procError, setProcError] = useState<string | null>(null);
  const [confirmDeleteProcId, setConfirmDeleteProcId] = useState<string | null>(null);

  // Tab 3: Youth Project Books
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectDraft, setProjectDraft] = useState<YouthProjectFormDraft>(() =>
    makeEmptyProjectDraft(settings.breederName || '')
  );
  const [projectError, setProjectError] = useState<string | null>(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null);
  const [expandedFeedProjectId, setExpandedFeedProjectId] = useState<string | null>(null);
  const [feedLogDateIso, setFeedLogDateIso] = useState(todayDateIso());
  const [feedLogType, setFeedLogType] = useState('');
  const [feedLogQty, setFeedLogQty] = useState('');
  const [feedLogUnit, setFeedLogUnit] = useState('lbs');
  const [feedLogCost, setFeedLogCost] = useState('');
  const [feedLogBatchId, setFeedLogBatchId] = useState('');
  const [feedLogNotes, setFeedLogNotes] = useState('');
  const [reportPreview, setReportPreview] = useState<{
    title: string;
    filename: string;
    htmlContent: string;
  } | null>(null);

  // Async submit & keyed delete locks
  const ledgerSubmitLock = useAsyncSubmitLock();
  const procSubmitLock = useAsyncSubmitLock();
  const projectSubmitLock = useAsyncSubmitLock();
  const feedLogSubmitLock = useAsyncSubmitLock();
  const deleteLock = useAsyncKeyedLock();

  // Accessible dialogs
  const ledgerDialogRef = useAccessibleDialog({
    isOpen: ledgerModalOpen,
    onClose: () => setLedgerModalOpen(false),
  });
  const lightboxDialogRef = useAccessibleDialog({
    isOpen: lightboxEntry !== null,
    onClose: () => setLightboxEntry(null),
  });
  const procDialogRef = useAccessibleDialog({
    isOpen: procModalOpen,
    onClose: () => setProcModalOpen(false),
  });
  const projectDialogRef = useAccessibleDialog({
    isOpen: projectModalOpen,
    onClose: () => setProjectModalOpen(false),
  });

  // Derived Analytics
  const econSummary = useMemo(
    () =>
      evaluateSpeciesEconomicsSummary({
        animals,
        breedings,
        ledgerEntries,
        feedBatches,
        processingLogs,
        currencyCode,
        dateFromIso: dateFromIso || undefined,
        dateToIso: dateToIso || undefined,
      }),
    [animals, breedings, ledgerEntries, feedBatches, processingLogs, currencyCode, dateFromIso, dateToIso]
  );

  const animalMargins = useMemo(
    () =>
      computeAnimalProfitMargins({
        animals,
        breedings,
        ledgerEntries,
        feedBatches,
        feedAllocations,
        processingLogs,
        dateFromIso: dateFromIso || undefined,
        dateToIso: dateToIso || undefined,
      }),
    [animals, breedings, ledgerEntries, feedBatches, feedAllocations, processingLogs, dateFromIso, dateToIso]
  );

  const litterMargins = useMemo(
    () =>
      computeLitterProfitMargins({
        animals,
        breedings,
        ledgerEntries,
        feedBatches,
        feedAllocations,
        processingLogs,
        dateFromIso: dateFromIso || undefined,
        dateToIso: dateToIso || undefined,
      }),
    [animals, breedings, ledgerEntries, feedBatches, feedAllocations, processingLogs, dateFromIso, dateToIso]
  );

  const procSummary = useMemo(
    () => evaluateProcessingSummary(processingLogs, todayDateIso()),
    [processingLogs]
  );

  const projectSummaries = useMemo(
    () =>
      youthProjectBooks.map((project) =>
        evaluateYouthProjectSummary(project, { animals, breedings, ledgerEntries })
      ),
    [youthProjectBooks, animals, breedings, ledgerEntries]
  );

  const filteredLedgerEntries = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return ledgerEntries.filter((entry) => {
      if (ledgerTypeFilter !== 'all' && entry.entryType !== ledgerTypeFilter) return false;
      if (ledgerCategoryFilter !== 'all' && entry.category !== ledgerCategoryFilter) return false;
      if (dateFromIso && entry.dateIso < dateFromIso) return false;
      if (dateToIso && entry.dateIso > dateToIso) return false;
      if (!q) return true;
      const linkedAnimal = entry.linkedAnimalId ? herdById.get(entry.linkedAnimalId) : undefined;
      const hay = [
        entry.title,
        entry.vendorOrParty,
        getLedgerCategoryLabel(entry.category),
        entry.notes,
        linkedAnimal?.name,
        linkedAnimal?.tattoo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    ledgerEntries,
    ledgerSearch,
    ledgerTypeFilter,
    ledgerCategoryFilter,
    dateFromIso,
    dateToIso,
    herdById,
  ]);

  const filteredProcessingLogs = useMemo(() => {
    if (procStatusFilter === 'all') return processingLogs;
    return processingLogs.filter((l) => l.status === procStatusFilter);
  }, [processingLogs, procStatusFilter]);

  // Live Dress-Out % preview in modal
  const draftLiveGrams = parseWeightInputToGrams(procDraft.liveWeightInput, weightUnit);
  const draftDressedGrams = parseWeightInputToGrams(procDraft.dressedWeightInput, weightUnit);
  const draftDressOutPreview = calculateDressOutPercent(draftLiveGrams, draftDressedGrams);

  const breedingLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of breedings) {
      map.set(
        b.id,
        `${b.damName || 'Dam'} × ${b.sireName || 'Sire'} (${b.actualBirthDateIso || b.bredDateIso})`
      );
    }
    return map;
  }, [breedings]);

  const handleExportLedgerCsv = async () => {
    try {
      const csv = formatEconomicsLedgerCsv(filteredLedgerEntries, currencyCode);
      const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await downloadTextFile(`${slug}-economic-ledger-${todayDateIso()}.csv`, csv, 'text/csv');
      setActionNotice(`Exported ${filteredLedgerEntries.length} ledger entries to CSV.`);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not export CSV file.');
    }
  };

  const handleExportProcessingCsv = async () => {
    try {
      const csv = formatProcessingLogsCsv(filteredProcessingLogs, weightUnit, currencyCode);
      const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await downloadTextFile(`${slug}-processing-yields-${todayDateIso()}.csv`, csv, 'text/csv');
      setActionNotice(`Exported ${filteredProcessingLogs.length} processing logs to CSV.`);
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : 'Could not export CSV file.');
    }
  };

  const handleReceiptFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLedgerError(null);
    setReceiptBusy(true);
    try {
      const optimized = await optimizeImageFile(file, 'compact');
      const safeFull = sanitizeSafeRasterImageDataUrl(optimized.dataUrl);
      const safeThumb = sanitizeSafeRasterImageDataUrl(optimized.thumbnailDataUrl);
      if (!safeFull) {
        throw new Error('Could not encode receipt image safely. Please try a JPG, PNG, or WebP.');
      }
      setLedgerDraft((prev) => ({
        ...prev,
        receiptPhotoDataUrl: safeFull,
        receiptPhotoThumbnailDataUrl: safeThumb || safeFull,
        receiptPhotoMimeType: optimized.mimeType,
        receiptPhotoBytes: optimized.storedBytes,
      }));
    } catch (err) {
      setLedgerError(
        err instanceof Error ? err.message : 'Could not compress receipt photo.'
      );
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleSubmitLedger = async (e: FormEvent) => {
    e.preventDefault();
    const title = ledgerDraft.title.trim();
    const amountCents = parseCurrencyInputToCents(ledgerDraft.amount);
    if (!title) {
      setLedgerError('Please enter a description or item title.');
      return;
    }
    if (amountCents <= 0) {
      setLedgerError('Please enter an amount greater than 0.');
      return;
    }
    setLedgerError(null);
    const res = await ledgerSubmitLock.runLocked(() =>
      onSaveLedgerEntry({
        ...(ledgerDraft.id ? { id: ledgerDraft.id } : {}),
        species: speciesProfile.name,
        dateIso: ledgerDraft.dateIso || todayDateIso(),
        entryType: ledgerDraft.entryType,
        category: ledgerDraft.category,
        amountCents,
        title,
        vendorOrParty: ledgerDraft.vendorOrParty.trim(),
        ...(ledgerDraft.linkedAnimalId ? { linkedAnimalId: ledgerDraft.linkedAnimalId } : {}),
        ...(ledgerDraft.linkedBreedingId ? { linkedBreedingId: ledgerDraft.linkedBreedingId } : {}),
        ...(ledgerDraft.linkedFeedBatchId
          ? { linkedFeedBatchId: ledgerDraft.linkedFeedBatchId }
          : {}),
        ...(ledgerDraft.linkedProjectId ? { linkedProjectId: ledgerDraft.linkedProjectId } : {}),
        ...(ledgerDraft.receiptPhotoDataUrl
          ? { receiptPhotoDataUrl: ledgerDraft.receiptPhotoDataUrl }
          : {}),
        ...(ledgerDraft.receiptPhotoThumbnailDataUrl
          ? { receiptPhotoThumbnailDataUrl: ledgerDraft.receiptPhotoThumbnailDataUrl }
          : {}),
        ...(ledgerDraft.receiptPhotoMimeType
          ? { receiptPhotoMimeType: ledgerDraft.receiptPhotoMimeType }
          : {}),
        ...(ledgerDraft.receiptPhotoBytes
          ? { receiptPhotoBytes: ledgerDraft.receiptPhotoBytes }
          : {}),
        notes: ledgerDraft.notes.trim(),
      })
    );
    if (!res.skipped && res.value) {
      setLedgerModalOpen(false);
    }
  };

  const handleSubmitProcessing = async (e: FormEvent) => {
    e.preventDefault();
    const title = procDraft.title.trim();
    if (!title) {
      setProcError('Please enter a batch or animal processing title.');
      return;
    }
    if (procDraft.status === 'Scheduled' && !procDraft.scheduledDateIso.trim()) {
      setProcError('Scheduled processing entries require a scheduled butcher date.');
      return;
    }
    setProcError(null);
    const liveWeightGrams = parseWeightInputToGrams(procDraft.liveWeightInput, weightUnit);
    const dressedWeightGrams = parseWeightInputToGrams(procDraft.dressedWeightInput, weightUnit);
    const processingCostCents = parseCurrencyInputToCents(procDraft.processingCost);
    const meatValueCents = parseCurrencyInputToCents(procDraft.meatValue);
    const peltValueCents = parseCurrencyInputToCents(procDraft.peltValue);

    const res = await procSubmitLock.runLocked(() =>
      onSaveProcessingLog({
        ...(procDraft.id ? { id: procDraft.id } : {}),
        species: speciesProfile.name,
        title,
        status: procDraft.status,
        scheduledDateIso: procDraft.scheduledDateIso.trim(),
        harvestDateIso: procDraft.harvestDateIso.trim(),
        ...(procDraft.linkedAnimalId ? { linkedAnimalId: procDraft.linkedAnimalId } : {}),
        ...(procDraft.linkedBreedingId ? { linkedBreedingId: procDraft.linkedBreedingId } : {}),
        animalCount: Math.max(1, Number.parseInt(procDraft.animalCount, 10) || 1),
        liveWeightGrams,
        dressedWeightGrams,
        ...(draftDressOutPreview !== undefined ? { dressOutPercent: draftDressOutPreview } : {}),
        peltCount: Math.max(0, Number.parseInt(procDraft.peltCount, 10) || 0),
        peltGrade: procDraft.peltGrade,
        peltColorNotes: procDraft.peltColorNotes.trim(),
        ...(processingCostCents > 0 ? { processingCostCents } : {}),
        ...(meatValueCents > 0 ? { meatValueCents } : {}),
        ...(peltValueCents > 0 ? { peltValueCents } : {}),
        notes: procDraft.notes.trim(),
      })
    );
    if (!res.skipped && res.value) {
      setProcModalOpen(false);
    }
  };

  const handleSubmitProject = async (e: FormEvent) => {
    e.preventDefault();
    const projectTitle = projectDraft.projectTitle.trim();
    if (!projectTitle) {
      setProjectError('Please enter a project title.');
      return;
    }
    setProjectError(null);
    const existingBook = projectDraft.id
      ? youthProjectBooks.find((p) => p.id === projectDraft.id)
      : undefined;

    const res = await projectSubmitLock.runLocked(() =>
      onSaveYouthProjectBook({
        ...(projectDraft.id ? { id: projectDraft.id } : {}),
        species: speciesProfile.name,
        organization: projectDraft.organization,
        projectTitle,
        memberName: projectDraft.memberName.trim(),
        clubOrChapter: projectDraft.clubOrChapter.trim(),
        leaderOrAdvisor: projectDraft.leaderOrAdvisor.trim(),
        projectYear: projectDraft.projectYear.trim() || todayDateIso().slice(0, 4),
        startDateIso: projectDraft.startDateIso.trim() || todayDateIso(),
        endDateIso: projectDraft.endDateIso.trim(),
        status: projectDraft.status,
        linkedAnimalIds: projectDraft.linkedAnimalIds,
        linkedBreedingIds: projectDraft.linkedBreedingIds,
        startingInventoryValueCents: parseCurrencyInputToCents(projectDraft.startingInventoryValue),
        endingInventoryValueCents: parseCurrencyInputToCents(projectDraft.endingInventoryValue),
        feedLogs: existingBook?.feedLogs ?? [],
        goalsAndReflection: projectDraft.goalsAndReflection.trim(),
        showAndCommunityNotes: projectDraft.showAndCommunityNotes.trim(),
        notes: projectDraft.notes.trim(),
      })
    );
    if (!res.skipped && res.value) {
      setProjectModalOpen(false);
    }
  };

  const handleAddProjectFeedLog = async (project: YouthProjectBook, e: FormEvent) => {
    e.preventDefault();
    const feedType = feedLogType.trim();
    const qty = Number.parseFloat(feedLogQty);
    const costCents = parseCurrencyInputToCents(feedLogCost);
    if (!feedType) {
      setActionNotice('Please enter a feed or ration description for the project feed log.');
      return;
    }
    const newEntry: YouthProjectFeedLogEntry = {
      id: generateUuid(),
      dateIso: feedLogDateIso || todayDateIso(),
      feedType,
      quantity: Number.isFinite(qty) && qty > 0 ? Number(qty.toFixed(2)) : 0,
      unit: feedLogUnit.trim() || 'lbs',
      costCents,
      ...(feedLogBatchId ? { linkedFeedBatchId: feedLogBatchId } : {}),
      ...(feedLogNotes.trim() ? { notes: feedLogNotes.trim() } : {}),
    };
    const res = await feedLogSubmitLock.runLocked(() =>
      onSaveYouthProjectBook({
        ...project,
        feedLogs: [newEntry, ...(project.feedLogs ?? [])],
      })
    );
    if (!res.skipped && res.value) {
      setFeedLogType('');
      setFeedLogQty('');
      setFeedLogCost('');
      setFeedLogBatchId('');
      setFeedLogNotes('');
    }
  };

  const handleRemoveProjectFeedLog = async (
    project: YouthProjectBook,
    entryId: string
  ) => {
    await deleteLock.runKeyLocked(`yfl:${entryId}`, () =>
      onSaveYouthProjectBook({
        ...project,
        feedLogs: (project.feedLogs ?? []).filter((fl) => fl.id !== entryId),
      })
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to Hub
            </button>
            <span className="px-2.5 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold text-[var(--barn-sage)]">
              {speciesProfile.name} Only
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--barn-ink)]">
            {speciesProfile.name} Economics, Yields &amp; 4-H Books
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Track barn expenses &amp; receipts, automated animal/litter P&amp;L margins, meat &amp; pelt
            harvest yields, and printable 4-H / FFA youth project record books.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'ledger' && (
            <>
              <button
                type="button"
                onClick={() => void handleExportLedgerCsv()}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Export Ledger CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setLedgerDraft(makeEmptyLedgerDraft());
                  setLedgerError(null);
                  setLedgerModalOpen(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Expense / Income
              </button>
            </>
          )}

          {activeTab === 'processing' && (
            <>
              <button
                type="button"
                onClick={() => void handleExportProcessingCsv()}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                Export Yields CSV
              </button>
              <button
                type="button"
                onClick={() => {
                  setProcDraft(makeEmptyProcessingDraft());
                  setProcError(null);
                  setProcModalOpen(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Log Butcher / Harvest
              </button>
            </>
          )}

          {activeTab === 'youth' && (
            <button
              type="button"
              onClick={() => {
                setProjectDraft(makeEmptyProjectDraft(settings.breederName || ''));
                setProjectError(null);
                setProjectModalOpen(true);
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New 4-H / FFA Book
            </button>
          )}
        </div>
      </section>

      {actionNotice && (
        <div
          role="status"
          className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-4 py-2.5 text-xs flex items-center justify-between gap-3"
        >
          <span>{actionNotice}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="underline text-[11px] shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Economics and Youth Project Sections"
        className="flex flex-wrap gap-2 border-b border-[var(--barn-border)] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ledger'}
          onClick={() => setActiveTab('ledger')}
          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'ledger'
              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
          }`}
        >
          <DollarSign className="w-4 h-4" aria-hidden="true" />
          Expenses, Receipts &amp; P&amp;L ({ledgerEntries.length})
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'processing'}
          onClick={() => setActiveTab('processing')}
          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'processing'
              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
          }`}
        >
          <Scale className="w-4 h-4" aria-hidden="true" />
          Meat &amp; Pelt Yields ({processingLogs.length})
          {procSummary.overdueScheduledLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--barn-terracotta)] text-white text-[10px] font-bold">
              {procSummary.overdueScheduledLogs.length} due
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'youth'}
          onClick={() => setActiveTab('youth')}
          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'youth'
              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
          }`}
        >
          <GraduationCap className="w-4 h-4" aria-hidden="true" />
          4-H / FFA Project Books ({youthProjectBooks.length})
        </button>
      </div>

      {/* TAB 1: EXPENSES, RECEIPTS & PROFIT MARGINS */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                Gross Revenue
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-ink)]">
                {formatCurrencyCents(econSummary.totalRevenueCents, currencyCode)}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                Sales + stud fees + ledger + meat/pelts
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)] flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                Total Expenses
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-ink)]">
                {formatCurrencyCents(econSummary.totalExpenseCents, currencyCode)}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                Feed, bedding, vet, gear &amp; stock buys
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                Net Profit / Margin
              </div>
              <div
                className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${
                  econSummary.netProfitCents >= 0
                    ? 'text-[var(--barn-sage)]'
                    : 'text-[var(--barn-terracotta)]'
                }`}
              >
                {formatCurrencyCents(econSummary.netProfitCents, currencyCode)}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                Margin:{' '}
                {econSummary.marginPercent !== null
                  ? `${econSummary.marginPercent.toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)] flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                Receipt Photos
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-ink)]">
                {econSummary.receiptAttachedCount}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                Compressed WebP/JPEG attachments
              </div>
            </div>
          </div>

          {/* Expense Breakdown by Category */}
          {econSummary.expenseBreakdown.length > 0 && (
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-[var(--barn-ink)]">
                Expense Breakdown by Category
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {econSummary.expenseBreakdown.map((item) => (
                  <div key={item.categoryKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-medium truncate">{item.label}</span>
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        {formatCurrencyCents(item.amountCents, currencyCode)} (
                        {item.sharePercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--barn-canvas)] overflow-hidden border border-[var(--barn-border)]">
                      <div
                        className="h-full bg-[var(--barn-sage)]"
                        style={{ width: `${Math.min(100, Math.max(2, item.sharePercent))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Filter Bar & General Barn Ledger Table */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <h2 className="text-sm font-bold text-[var(--barn-ink)]">
                General Barn Ledger ({filteredLedgerEntries.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search title, vendor, animal..."
                    aria-label="Search ledger entries"
                    className="min-h-[36px] pl-8 pr-3 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                </div>

                <select
                  aria-label="Filter ledger entry type"
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value as LedgerTypeFilter)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="all">All Types</option>
                  <option value="expense">Expenses Only</option>
                  <option value="income">Income Only</option>
                </select>

                <select
                  aria-label="Filter ledger category"
                  value={ledgerCategoryFilter}
                  onChange={(e) => setLedgerCategoryFilter(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="all">All Categories</option>
                  {LEDGER_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  aria-label="Filter from date"
                  value={dateFromIso}
                  onChange={(e) => setDateFromIso(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="date"
                  aria-label="Filter to date"
                  value={dateToIso}
                  onChange={(e) => setDateToIso(e.target.value)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                {(dateFromIso || dateToIso || ledgerSearch || ledgerTypeFilter !== 'all' || ledgerCategoryFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerSearch('');
                      setLedgerTypeFilter('all');
                      setLedgerCategoryFilter('all');
                      setDateFromIso('');
                      setDateToIso('');
                    }}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs hover:bg-[var(--barn-subtle)]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {filteredLedgerEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-6 text-center space-y-2">
                <p className="text-xs text-[var(--barn-muted)]">
                  No ledger entries match the current filter. Record bedding, vet bills, equipment,
                  show entries, or sales with compressed receipt photos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerDraft(makeEmptyLedgerDraft());
                    setLedgerError(null);
                    setLedgerModalOpen(true);
                  }}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Add First Ledger Entry
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredLedgerEntries.map((entry) => {
                  const safeThumb = sanitizeSafeRasterImageDataUrl(
                    entry.receiptPhotoThumbnailDataUrl || entry.receiptPhotoDataUrl
                  );
                  const linkedAnimal = entry.linkedAnimalId
                    ? herdById.get(entry.linkedAnimalId)
                    : undefined;
                  const linkedBreedingLabel = entry.linkedBreedingId
                    ? breedingLabelById.get(entry.linkedBreedingId)
                    : undefined;
                  const deleting = deleteLock.isKeyLocked(`ledger:${entry.id}`);

                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {safeThumb ? (
                          <button
                            type="button"
                            onClick={() => setLightboxEntry(entry)}
                            aria-label={`View receipt photo for ${entry.title}`}
                            className="w-12 h-12 rounded-lg overflow-hidden border border-[var(--barn-border)] shrink-0 hover:opacity-90"
                          >
                            <img
                              src={safeThumb}
                              alt={`Receipt thumbnail for ${entry.title}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-12 h-12 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] flex items-center justify-center shrink-0 text-[var(--barn-muted)]">
                            <Receipt className="w-5 h-5" aria-hidden="true" />
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-[var(--barn-ink)]">
                              {entry.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                entry.entryType === 'income'
                                  ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)]'
                                  : 'bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)]'
                              }`}
                            >
                              {entry.entryType === 'income' ? 'Income' : 'Expense'} ·{' '}
                              {getLedgerCategoryLabel(entry.category)}
                            </span>
                          </div>

                          <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span>{formatReadableDate(entry.dateIso)}</span>
                            {entry.vendorOrParty && <span>Party: {entry.vendorOrParty}</span>}
                            {linkedAnimal && (
                              <button
                                type="button"
                                onClick={() => onOpenAnimal(linkedAnimal.id)}
                                className="underline text-[var(--barn-sage)] inline-flex items-center gap-0.5"
                              >
                                {linkedAnimal.name}
                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                              </button>
                            )}
                            {linkedBreedingLabel && <span>Litter: {linkedBreedingLabel}</span>}
                          </div>

                          {entry.notes && (
                            <p className="text-[11px] text-[var(--barn-muted)] break-words">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <span
                          className={`text-sm font-bold font-mono tabular-nums ${
                            entry.entryType === 'income'
                              ? 'text-[var(--barn-sage)]'
                              : 'text-[var(--barn-ink)]'
                          }`}
                        >
                          {entry.entryType === 'income' ? '+' : '-'}
                          {formatCurrencyCents(entry.amountCents, currencyCode)}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setLedgerDraft(ledgerToDraft(entry));
                            setLedgerError(null);
                            setLedgerModalOpen(true);
                          }}
                          aria-label={`Edit ${entry.title}`}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>

                        {confirmDeleteLedgerId === entry.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() =>
                                void deleteLock.runKeyLocked(`ledger:${entry.id}`, async () => {
                                  await onDeleteLedgerEntry(entry.id);
                                  setConfirmDeleteLedgerId(null);
                                })
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold disabled:opacity-60"
                            >
                              {deleting ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLedgerId(null)}
                              className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteLedgerId(entry.id)}
                            aria-label={`Delete ${entry.title}`}
                            className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-terracotta)] flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Automated Per-Litter & Per-Animal Profit/Loss Margins */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--barn-ink)]">
                  Automated Net Profit &amp; Loss Margins
                </h2>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Combines animal sales, stock purchases, stud fees, allocated feed lot costs,
                  processing yields/costs, and linked ledger items automatically.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5">
                <button
                  type="button"
                  onClick={() => setMarginSubTab('litters')}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold ${
                    marginSubTab === 'litters'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'text-[var(--barn-muted)]'
                  }`}
                >
                  Per Litter ({litterMargins.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMarginSubTab('animals')}
                  className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold ${
                    marginSubTab === 'animals'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'text-[var(--barn-muted)]'
                  }`}
                >
                  Per Animal ({animalMargins.length})
                </button>
              </div>
            </div>

            {marginSubTab === 'litters' ? (
              litterMargins.length === 0 ? (
                <p className="text-xs text-[var(--barn-muted)]">
                  No breeding / litter records found for this species and date window yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--barn-border)] text-left text-[11px] uppercase text-[var(--barn-muted)]">
                        <th className="py-2 pr-3">Litter / Pairing</th>
                        <th className="py-2 px-2 text-right">Revenue</th>
                        <th className="py-2 px-2 text-right">Allocated Feed</th>
                        <th className="py-2 px-2 text-right">Total Cost</th>
                        <th className="py-2 px-2 text-right">Cost / Weaned</th>
                        <th className="py-2 pl-2 text-right">Net P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--barn-border)]">
                      {litterMargins.map((row) => (
                        <tr key={row.breeding.id}>
                          <td className="py-2.5 pr-3 font-medium">
                            <div>{row.label}</div>
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              {row.offspringMatchedCount} matched {speciesProfile.offspringLabel.toLowerCase()}
                              (s)
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {formatCurrencyCents(row.totalRevenueCents, currencyCode)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {formatCurrencyCents(row.allocatedFeedCostCents, currencyCode)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {formatCurrencyCents(row.totalCostCents, currencyCode)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {row.costPerWeanedCents !== null
                              ? formatCurrencyCents(row.costPerWeanedCents, currencyCode)
                              : '—'}
                          </td>
                          <td
                            className={`py-2.5 pl-2 text-right font-mono font-bold tabular-nums ${
                              row.netProfitCents >= 0
                                ? 'text-[var(--barn-sage)]'
                                : 'text-[var(--barn-terracotta)]'
                            }`}
                          >
                            {formatCurrencyCents(row.netProfitCents, currencyCode)}
                            {row.marginPercent !== null ? ` (${row.marginPercent.toFixed(0)}%)` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : animalMargins.length === 0 ? (
              <p className="text-xs text-[var(--barn-muted)]">
                No individual animals have financial revenue or expenses in this window yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--barn-border)] text-left text-[11px] uppercase text-[var(--barn-muted)]">
                      <th className="py-2 pr-3">Animal</th>
                      <th className="py-2 px-2 text-right">Sales + Stud</th>
                      <th className="py-2 px-2 text-right">Harvest / Ledger</th>
                      <th className="py-2 px-2 text-right">Purchase + Feed + Costs</th>
                      <th className="py-2 pl-2 text-right">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--barn-border)]">
                    {animalMargins.map((row) => (
                      <tr key={row.animal.id}>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => onOpenAnimal(row.animal.id)}
                            className="font-semibold text-[var(--barn-sage)] underline inline-flex items-center gap-1"
                          >
                            {row.animal.name}
                            {row.animal.tattoo ? ` (${row.animal.tattoo})` : ''}
                          </button>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {formatCurrencyCents(
                            row.directSaleCents + row.studFeesEarnedCents,
                            currencyCode
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {formatCurrencyCents(
                            row.processingRevenueCents + row.ledgerIncomeCents,
                            currencyCode
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {formatCurrencyCents(row.totalCostCents, currencyCode)}
                        </td>
                        <td
                          className={`py-2.5 pl-2 text-right font-mono font-bold tabular-nums ${
                            row.netProfitCents >= 0
                              ? 'text-[var(--barn-sage)]'
                              : 'text-[var(--barn-terracotta)]'
                          }`}
                        >
                          {formatCurrencyCents(row.netProfitCents, currencyCode)}
                          {row.marginPercent !== null ? ` (${row.marginPercent.toFixed(0)}%)` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: MEAT & PELT PROCESSING YIELDS */}
      {activeTab === 'processing' && (
        <div className="space-y-6">
          {/* Overdue / Upcoming Butcher Schedule Alerts */}
          {(procSummary.overdueScheduledLogs.length > 0 ||
            procSummary.upcomingScheduledLogs.length > 0) && (
            <section
              aria-label="Scheduled butcher dates"
              className={`rounded-2xl border p-4 space-y-2 ${
                procSummary.overdueScheduledLogs.length > 0
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                  : 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Butcher Schedule: {procSummary.overdueScheduledLogs.length} overdue ·{' '}
                  {procSummary.upcomingScheduledLogs.length} upcoming
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...procSummary.overdueScheduledLogs, ...procSummary.upcomingScheduledLogs].map(
                  (log) => (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => {
                        setProcDraft(processingToDraft(log, weightUnit));
                        setProcError(null);
                        setProcModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium hover:border-[var(--barn-sage)]"
                    >
                      {log.title} — {formatReadableDate(log.scheduledDateIso)} ({log.animalCount})
                    </button>
                  )
                )}
              </div>
            </section>
          )}

          {/* Yield KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                Processed Head
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                {procSummary.totalAnimalsProcessed}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                Across {procSummary.processedCount} harvested batch
                {procSummary.processedCount === 1 ? '' : 'es'}
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                Weighted Dress-Out %
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
                {procSummary.averageDressOutPercent !== null
                  ? `${procSummary.averageDressOutPercent.toFixed(1)}%`
                  : 'N/A'}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {procSummary.totalDressedWeightGrams > 0
                  ? `${formatWeight(procSummary.totalDressedWeightGrams, weightUnit)} dressed`
                  : 'Log live & dressed weights'}
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                Pelts Saved
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
                {procSummary.totalPelts}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] truncate">
                {Object.entries(procSummary.peltGradeCounts)
                  .map(([grade, count]) => `${grade}: ${count}`)
                  .join(' · ') || 'No pelt grades yet'}
              </div>
            </div>

            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
                Meat + Pelt Value
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
                {formatCurrencyCents(
                  procSummary.totalMeatValueCents + procSummary.totalPeltValueCents,
                  currencyCode
                )}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                Processing costs:{' '}
                {formatCurrencyCents(procSummary.totalProcessingCostCents, currencyCode)}
              </div>
            </div>
          </div>

          {/* Processing Logs List */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[var(--barn-ink)]">
                Meat &amp; Pelt Processing Logs ({filteredProcessingLogs.length})
              </h2>
              <select
                aria-label="Filter processing status"
                value={procStatusFilter}
                onChange={(e) =>
                  setProcStatusFilter(e.target.value as 'all' | ProcessingStatus)
                }
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Processed">Processed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {filteredProcessingLogs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-6 text-center space-y-2">
                <p className="text-xs text-[var(--barn-muted)]">
                  No meat or pelt processing logs recorded for {speciesProfile.name} yet. Track
                  scheduled butcher dates, live vs. dressed carcass yields, and pelt grades.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setProcDraft(makeEmptyProcessingDraft());
                    setProcError(null);
                    setProcModalOpen(true);
                  }}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  Schedule or Log Harvest
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredProcessingLogs.map((log) => {
                  const pct =
                    log.dressOutPercent ??
                    calculateDressOutPercent(log.liveWeightGrams, log.dressedWeightGrams);
                  const linkedAnimal = log.linkedAnimalId
                    ? herdById.get(log.linkedAnimalId)
                    : undefined;
                  const deleting = deleteLock.isKeyLocked(`proc:${log.id}`);

                  return (
                    <div
                      key={log.id}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[var(--barn-ink)]">
                            {log.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              log.status === 'Processed'
                                ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)]'
                                : log.status === 'Scheduled'
                                ? 'bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)]'
                                : 'bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                            }`}
                          >
                            {log.status} · {log.animalCount} head
                          </span>
                          {pct !== undefined && (
                            <span className="px-2 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[10px] font-mono font-bold">
                              {pct.toFixed(1)}% Dress-Out
                            </span>
                          )}
                          {log.peltGrade && (
                            <span className="px-2 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[10px] font-medium">
                              Pelt: {log.peltGrade} ({log.peltCount})
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {log.scheduledDateIso && (
                            <span>Scheduled: {formatReadableDate(log.scheduledDateIso)}</span>
                          )}
                          {log.harvestDateIso && (
                            <span>Harvested: {formatReadableDate(log.harvestDateIso)}</span>
                          )}
                          {log.liveWeightGrams > 0 && (
                            <span>Live: {formatWeight(log.liveWeightGrams, weightUnit)}</span>
                          )}
                          {log.dressedWeightGrams > 0 && (
                            <span>Dressed: {formatWeight(log.dressedWeightGrams, weightUnit)}</span>
                          )}
                          {linkedAnimal && (
                            <button
                              type="button"
                              onClick={() => onOpenAnimal(linkedAnimal.id)}
                              className="underline text-[var(--barn-sage)]"
                            >
                              {linkedAnimal.name}
                            </button>
                          )}
                        </div>

                        {log.notes && (
                          <p className="text-[11px] text-[var(--barn-muted)] break-words">
                            {log.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <div className="text-right font-mono text-xs tabular-nums">
                          {((log.meatValueCents || 0) > 0 || (log.peltValueCents || 0) > 0) && (
                            <div className="font-bold text-[var(--barn-sage)]">
                              +
                              {formatCurrencyCents(
                                (log.meatValueCents || 0) + (log.peltValueCents || 0),
                                currencyCode
                              )}
                            </div>
                          )}
                          {(log.processingCostCents || 0) > 0 && (
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              Cost: {formatCurrencyCents(log.processingCostCents, currencyCode)}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setProcDraft(processingToDraft(log, weightUnit));
                            setProcError(null);
                            setProcModalOpen(true);
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>

                        {confirmDeleteProcId === log.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() =>
                                void deleteLock.runKeyLocked(`proc:${log.id}`, async () => {
                                  await onDeleteProcessingLog(log.id);
                                  setConfirmDeleteProcId(null);
                                })
                              }
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold disabled:opacity-60"
                            >
                              {deleting ? 'Deleting...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProcId(null)}
                              className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProcId(log.id)}
                            aria-label={`Delete ${log.title}`}
                            className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-terracotta)] flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: 4-H / FFA YOUTH PROJECT RECORD BOOKS */}
      {activeTab === 'youth' && (
        <div className="space-y-4">
          {projectSummaries.length === 0 ? (
            <section className="bg-[var(--barn-surface)] border border-dashed border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
              <Award className="w-8 h-8 mx-auto text-[var(--barn-sage)]" aria-hidden="true" />
              <h2 className="text-sm font-bold text-[var(--barn-ink)]">
                No 4-H or FFA Project Record Books Yet
              </h2>
              <p className="text-xs text-[var(--barn-muted)] max-w-lg mx-auto">
                Create a youth livestock project book to track enrolled {speciesProfile.name} stock,
                ration &amp; feed logs, project-linked income/expenses, inventory changes, and print
                an official completion report for county fair or SAE advisor sign-off.
              </p>
              <button
                type="button"
                onClick={() => {
                  setProjectDraft(makeEmptyProjectDraft(settings.breederName || ''));
                  setProjectError(null);
                  setProjectModalOpen(true);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Create Youth Project Book
              </button>
            </section>
          ) : (
            projectSummaries.map((sum) => {
              const { project } = sum;
              const feedDrawerOpen = expandedFeedProjectId === project.id;
              const deleting = deleteLock.isKeyLocked(`project:${project.id}`);

              return (
                <section
                  key={project.id}
                  className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[10px] font-bold">
                          {project.organization} · {project.projectYear}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[10px] font-semibold">
                          {project.status}
                        </span>
                        <h2 className="text-base font-bold text-[var(--barn-ink)]">
                          {project.projectTitle}
                        </h2>
                      </div>
                      <div className="text-xs text-[var(--barn-muted)] flex flex-wrap gap-x-3 gap-y-0.5">
                        {project.memberName && <span>Member: {project.memberName}</span>}
                        {project.clubOrChapter && <span>Club/Chapter: {project.clubOrChapter}</span>}
                        {project.leaderOrAdvisor && <span>Advisor: {project.leaderOrAdvisor}</span>}
                        <span>
                          {sum.enrolledAnimals.length} animal
                          {sum.enrolledAnimals.length === 1 ? '' : 's'} · {sum.enrolledBreedings.length}{' '}
                          litter{sum.enrolledBreedings.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setReportPreview({
                            title: `${project.organization} Project Book — ${project.projectTitle}`,
                            filename: `${project.organization.toLowerCase()}-project-${project.projectYear}-${todayDateIso()}.htm`,
                            htmlContent: generateYouthProjectReportHtml({
                              summary: sum,
                              settings,
                              speciesProfile,
                            }),
                          });
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        Print / PDF Report
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedFeedProjectId(feedDrawerOpen ? null : project.id)
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
                      >
                        Feed Log ({sum.feedLogCount})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setProjectDraft(projectToDraft(project));
                          setProjectError(null);
                          setProjectModalOpen(true);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit
                      </button>

                      {confirmDeleteProjectId === project.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deleting}
                            onClick={() =>
                              void deleteLock.runKeyLocked(`project:${project.id}`, async () => {
                                await onDeleteYouthProjectBook(project.id);
                                setConfirmDeleteProjectId(null);
                              })
                            }
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold disabled:opacity-60"
                          >
                            {deleting ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProjectId(null)}
                            className="min-h-[36px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProjectId(project.id)}
                          aria-label={`Delete ${project.projectTitle}`}
                          className="min-h-[36px] min-w-[36px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-terracotta)] flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Project Financial Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                      <div className="text-[10px] uppercase text-[var(--barn-muted)] font-semibold">
                        Project Income
                      </div>
                      <div className="font-mono font-bold text-sm mt-0.5 text-[var(--barn-sage)]">
                        {formatCurrencyCents(sum.totalIncomeCents, currencyCode)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                      <div className="text-[10px] uppercase text-[var(--barn-muted)] font-semibold">
                        Feed &amp; Expenses
                      </div>
                      <div className="font-mono font-bold text-sm mt-0.5">
                        {formatCurrencyCents(sum.totalExpenseCents, currencyCode)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                      <div className="text-[10px] uppercase text-[var(--barn-muted)] font-semibold">
                        Inventory Change
                      </div>
                      <div className="font-mono font-bold text-sm mt-0.5">
                        {formatCurrencyCents(sum.inventoryDeltaCents, currencyCode)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                      <div className="text-[10px] uppercase text-[var(--barn-muted)] font-semibold">
                        Net Project Return
                      </div>
                      <div
                        className={`font-mono font-bold text-sm mt-0.5 ${
                          sum.netProjectProfitCents >= 0
                            ? 'text-[var(--barn-sage)]'
                            : 'text-[var(--barn-terracotta)]'
                        }`}
                      >
                        {formatCurrencyCents(sum.netProjectProfitCents, currencyCode)}
                      </div>
                    </div>
                  </div>

                  {/* Inline Project Feed Log Drawer */}
                  {feedDrawerOpen && (
                    <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3.5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold text-[var(--barn-ink)]">
                          Project Ration &amp; Feed Record Log ({sum.feedLogCount} · Total{' '}
                          {sum.totalFeedQuantity} units ·{' '}
                          {formatCurrencyCents(sum.totalFeedLogCostCents, currencyCode)})
                        </h3>
                      </div>

                      <form
                        onSubmit={(e) => void handleAddProjectFeedLog(project, e)}
                        className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end"
                      >
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-[var(--barn-muted)]">Date</span>
                          <input
                            type="date"
                            value={feedLogDateIso}
                            onChange={(e) => setFeedLogDateIso(e.target.value)}
                            className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          />
                        </label>
                        <label className="block space-y-1 text-[11px] sm:col-span-2">
                          <span className="font-medium text-[var(--barn-muted)]">
                            Feed / Ration *
                          </span>
                          <input
                            type="text"
                            value={feedLogType}
                            onChange={(e) => setFeedLogType(e.target.value)}
                            placeholder="e.g. 18% Show Pellet + Timothy"
                            className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          />
                        </label>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-[var(--barn-muted)]">Qty &amp; Unit</span>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={feedLogQty}
                              onChange={(e) => setFeedLogQty(e.target.value)}
                              placeholder="50"
                              className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                            <input
                              type="text"
                              value={feedLogUnit}
                              onChange={(e) => setFeedLogUnit(e.target.value)}
                              aria-label="Feed unit"
                              className="w-16 min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                            />
                          </div>
                        </label>
                        <label className="block space-y-1 text-[11px]">
                          <span className="font-medium text-[var(--barn-muted)]">
                            Cost ({currencyCode})
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={feedLogCost}
                            onChange={(e) => setFeedLogCost(e.target.value)}
                            placeholder="24.50"
                            className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={feedLogSubmitLock.isSubmitting}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
                        >
                          {feedLogSubmitLock.isSubmitting ? 'Adding...' : '+ Log Feed'}
                        </button>
                      </form>

                      {(project.feedLogs ?? []).length > 0 && (
                        <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-lg bg-[var(--barn-surface)]">
                          {project.feedLogs.map((fl) => (
                            <div
                              key={fl.id}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold">{fl.feedType}</span> ·{' '}
                                <span className="text-[var(--barn-muted)]">
                                  {formatReadableDate(fl.dateIso)} · {fl.quantity} {fl.unit}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono tabular-nums font-semibold">
                                  {formatCurrencyCents(fl.costCents, currencyCode)}
                                </span>
                                <button
                                  type="button"
                                  disabled={deleteLock.isKeyLocked(`yfl:${fl.id}`)}
                                  onClick={() => void handleRemoveProjectFeedLog(project, fl.id)}
                                  aria-label={`Remove ${fl.feedType} log`}
                                  className="p-1 text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      )}

      {/* MODAL 1: ADD / EDIT LEDGER ENTRY */}
      {ledgerModalOpen && (
        <div
          ref={ledgerDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLedgerModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitLedger(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="ledger-modal-title" className="text-base font-bold">
                {ledgerDraft.id ? 'Edit Ledger Entry' : 'Add Barn Expense or Income'}
              </h2>
              <button
                type="button"
                onClick={() => setLedgerModalOpen(false)}
                aria-label="Close ledger modal"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {ledgerError && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] px-3 py-2 text-xs"
              >
                {ledgerError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Entry Type</span>
                <select
                  value={ledgerDraft.entryType}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({
                      ...prev,
                      entryType: e.target.value as LedgerEntryType,
                    }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Category</span>
                <select
                  value={ledgerDraft.category}
                  onChange={(e) => {
                    const cat = e.target.value as LedgerCategory;
                    const opt = LEDGER_CATEGORY_OPTIONS.find((o) => o.value === cat);
                    setLedgerDraft((prev) => ({
                      ...prev,
                      category: cat,
                      entryType: opt ? opt.defaultType : prev.entryType,
                    }));
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {LEDGER_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold">Title / Description *</span>
                <input
                  type="text"
                  required
                  value={ledgerDraft.title}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="e.g. Pine shavings & nest box hay, or Buck stud service fee"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Amount ({currencyCode}) *</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={ledgerDraft.amount}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Date</span>
                <input
                  type="date"
                  value={ledgerDraft.dateIso}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, dateIso: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold">Vendor / Buyer / Payee</span>
                <input
                  type="text"
                  value={ledgerDraft.vendorOrParty}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, vendorOrParty: e.target.value }))
                  }
                  placeholder="e.g. Tractor Supply, Vet Clinic, or Buyer Name"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link to Animal (optional)</span>
                <select
                  value={ledgerDraft.linkedAnimalId}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, linkedAnimalId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None (General Barn)</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.tattoo ? `(${a.tattoo})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link to Litter / Breeding (optional)</span>
                <select
                  value={ledgerDraft.linkedBreedingId}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, linkedBreedingId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {breedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.damName || 'Dam'} × {b.sireName || 'Sire'} (
                      {b.actualBirthDateIso || b.bredDateIso})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link Feed Lot (prevents double counting)</span>
                <select
                  value={ledgerDraft.linkedFeedBatchId}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, linkedFeedBatchId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {feedBatches.map((fb) => (
                    <option key={fb.id} value={fb.id}>
                      {fb.brand} {fb.productName} ({formatReadableDate(fb.purchaseDateIso)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link 4-H / FFA Project Book (optional)</span>
                <select
                  value={ledgerDraft.linkedProjectId}
                  onChange={(e) =>
                    setLedgerDraft((prev) => ({ ...prev, linkedProjectId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {youthProjectBooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.organization} — {p.projectTitle} ({p.projectYear})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Compressed Receipt Photo Attachment */}
            <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">Receipt Photo Attachment (Optional)</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    Auto-compressed offline to compact WebP/JPEG (~960px) to protect storage.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={receiptInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleReceiptFileChange(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={receiptBusy}
                    onClick={() => receiptInputRef.current?.click()}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-medium inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    {receiptBusy
                      ? 'Compressing...'
                      : ledgerDraft.receiptPhotoDataUrl
                      ? 'Replace Receipt'
                      : 'Attach Receipt Photo'}
                  </button>
                  {ledgerDraft.receiptPhotoDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setLedgerDraft((prev) => ({
                          ...prev,
                          receiptPhotoDataUrl: undefined,
                          receiptPhotoThumbnailDataUrl: undefined,
                          receiptPhotoMimeType: undefined,
                          receiptPhotoBytes: undefined,
                        }))
                      }
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)]"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {sanitizeSafeRasterImageDataUrl(
                ledgerDraft.receiptPhotoThumbnailDataUrl || ledgerDraft.receiptPhotoDataUrl
              ) && (
                <div className="flex items-center gap-3 pt-1">
                  <img
                    src={
                      sanitizeSafeRasterImageDataUrl(
                        ledgerDraft.receiptPhotoThumbnailDataUrl || ledgerDraft.receiptPhotoDataUrl
                      )!
                    }
                    alt="Compressed receipt preview"
                    className="w-16 h-16 rounded-lg object-cover border border-[var(--barn-border)]"
                  />
                  <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                    Stored size:{' '}
                    {ledgerDraft.receiptPhotoBytes
                      ? formatByteSizePure(ledgerDraft.receiptPhotoBytes)
                      : 'Compressed'}
                  </div>
                </div>
              )}
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-semibold">Notes</span>
              <textarea
                rows={2}
                value={ledgerDraft.notes}
                onChange={(e) => setLedgerDraft((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLedgerModalOpen(false)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={ledgerSubmitLock.isSubmitting || receiptBusy}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {ledgerSubmitLock.isSubmitting ? 'Saving...' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: RECEIPT LIGHTBOX */}
      {lightboxEntry && (
        <div
          ref={lightboxDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt photo for ${lightboxEntry.title}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxEntry(null);
          }}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl max-w-3xl w-full p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{lightboxEntry.title}</h3>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  {formatReadableDate(lightboxEntry.dateIso)} ·{' '}
                  {formatCurrencyCents(lightboxEntry.amountCents, currencyCode)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxEntry(null)}
                aria-label="Close receipt viewer"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sanitizeSafeRasterImageDataUrl(
              lightboxEntry.receiptPhotoDataUrl || lightboxEntry.receiptPhotoThumbnailDataUrl
            ) ? (
              <img
                src={
                  sanitizeSafeRasterImageDataUrl(
                    lightboxEntry.receiptPhotoDataUrl || lightboxEntry.receiptPhotoThumbnailDataUrl
                  )!
                }
                alt={`Full receipt for ${lightboxEntry.title}`}
                className="max-h-[70vh] mx-auto rounded-xl object-contain"
              />
            ) : (
              <div className="p-8 text-center text-xs text-[var(--barn-muted)]">
                <ImageIcon className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
                Receipt image unavailable.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: ADD / EDIT PROCESSING LOG */}
      {procModalOpen && (
        <div
          ref={procDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="proc-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProcModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitProcessing(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="proc-modal-title" className="text-base font-bold">
                {procDraft.id ? 'Edit Meat & Pelt Processing Log' : 'Log Meat & Pelt Processing'}
              </h2>
              <button
                type="button"
                onClick={() => setProcModalOpen(false)}
                aria-label="Close processing modal"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {procError && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] px-3 py-2 text-xs"
              >
                {procError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold">Batch or Animal Title *</span>
                <input
                  type="text"
                  required
                  value={procDraft.title}
                  onChange={(e) => setProcDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. October Grow-Out Fryer Pen #4"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Status</span>
                <select
                  value={procDraft.status}
                  onChange={(e) =>
                    setProcDraft((prev) => ({
                      ...prev,
                      status: e.target.value as ProcessingStatus,
                    }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="Scheduled">Scheduled (Future Butcher Date)</option>
                  <option value="Processed">Processed (Harvested)</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Animal Count</span>
                <input
                  type="number"
                  min="1"
                  value={procDraft.animalCount}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, animalCount: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Scheduled Butcher Date</span>
                <input
                  type="date"
                  value={procDraft.scheduledDateIso}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, scheduledDateIso: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Actual Harvest Date</span>
                <input
                  type="date"
                  value={procDraft.harvestDateIso}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, harvestDateIso: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Live Weight ({weightMeta.shortUnit})</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={procDraft.liveWeightInput}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, liveWeightInput: e.target.value }))
                  }
                  placeholder={weightMeta.placeholder}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">
                  Dressed Carcass Weight ({weightMeta.shortUnit})
                  {draftDressOutPreview !== undefined && (
                    <span className="ml-2 text-[var(--barn-sage)] font-mono">
                      ({draftDressOutPreview.toFixed(1)}% yield)
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={procDraft.dressedWeightInput}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, dressedWeightInput: e.target.value }))
                  }
                  placeholder={weightMeta.placeholder}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Pelts Saved Count</span>
                <input
                  type="number"
                  min="0"
                  value={procDraft.peltCount}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, peltCount: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Pelt Grade</span>
                <select
                  value={procDraft.peltGrade}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, peltGrade: e.target.value as PeltGrade }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {PELT_GRADE_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold">Pelt Color &amp; Fur Density Notes</span>
                <input
                  type="text"
                  value={procDraft.peltColorNotes}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, peltColorNotes: e.target.value }))
                  }
                  placeholder="e.g. Castors prime density, clean prime winter coat"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link Animal (optional)</span>
                <select
                  value={procDraft.linkedAnimalId}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, linkedAnimalId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.tattoo ? `(${a.tattoo})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Link Litter / Breeding (optional)</span>
                <select
                  value={procDraft.linkedBreedingId}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, linkedBreedingId: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {breedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.damName || 'Dam'} × {b.sireName || 'Sire'} (
                      {b.actualBirthDateIso || b.bredDateIso})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Processing Cost ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={procDraft.processingCost}
                  onChange={(e) =>
                    setProcDraft((prev) => ({ ...prev, processingCost: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-semibold">Meat Value ({currencyCode})</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={procDraft.meatValue}
                    onChange={(e) =>
                      setProcDraft((prev) => ({ ...prev, meatValue: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold">Pelt Value ({currencyCode})</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={procDraft.peltValue}
                    onChange={(e) =>
                      setProcDraft((prev) => ({ ...prev, peltValue: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </label>
              </div>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-semibold">Notes</span>
              <textarea
                rows={2}
                value={procDraft.notes}
                onChange={(e) => setProcDraft((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProcModalOpen(false)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={procSubmitLock.isSubmitting}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {procSubmitLock.isSubmitting ? 'Saving...' : 'Save Processing Log'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: ADD / EDIT YOUTH PROJECT RECORD BOOK */}
      {projectModalOpen && (
        <div
          ref={projectDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProjectModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitProject(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="project-modal-title" className="text-base font-bold">
                {projectDraft.id ? 'Edit 4-H / FFA Project Book' : 'Create 4-H / FFA Project Book'}
              </h2>
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                aria-label="Close youth project modal"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {projectError && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] px-3 py-2 text-xs"
              >
                {projectError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Youth Organization</span>
                <select
                  value={projectDraft.organization}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({
                      ...prev,
                      organization: e.target.value as YouthOrgType,
                    }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {YOUTH_ORG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Project Year &amp; Status</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectDraft.projectYear}
                    onChange={(e) =>
                      setProjectDraft((prev) => ({ ...prev, projectYear: e.target.value }))
                    }
                    className="w-24 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                  <select
                    value={projectDraft.status}
                    onChange={(e) =>
                      setProjectDraft((prev) => ({
                        ...prev,
                        status: e.target.value as 'Active' | 'Completed',
                      }))
                    }
                    className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  >
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold">Project Title *</span>
                <input
                  type="text"
                  required
                  value={projectDraft.projectTitle}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({ ...prev, projectTitle: e.target.value }))
                  }
                  placeholder={`e.g. ${speciesProfile.name} Market & Breeding SAE Project`}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Youth Member Name</span>
                <input
                  type="text"
                  value={projectDraft.memberName}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({ ...prev, memberName: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Club / FFA Chapter</span>
                <input
                  type="text"
                  value={projectDraft.clubOrChapter}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({ ...prev, clubOrChapter: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Leader / Advisor</span>
                <input
                  type="text"
                  value={projectDraft.leaderOrAdvisor}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({ ...prev, leaderOrAdvisor: e.target.value }))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-semibold">Start Date</span>
                  <input
                    type="date"
                    value={projectDraft.startDateIso}
                    onChange={(e) =>
                      setProjectDraft((prev) => ({ ...prev, startDateIso: e.target.value }))
                    }
                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="font-semibold">End Date</span>
                  <input
                    type="date"
                    value={projectDraft.endDateIso}
                    onChange={(e) =>
                      setProjectDraft((prev) => ({ ...prev, endDateIso: e.target.value }))
                    }
                    className="w-full min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="font-semibold">Starting Inventory Value ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={projectDraft.startingInventoryValue}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({
                      ...prev,
                      startingInventoryValue: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Ending Inventory Value ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={projectDraft.endingInventoryValue}
                  onChange={(e) =>
                    setProjectDraft((prev) => ({
                      ...prev,
                      endingInventoryValue: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>
            </div>

            {/* Enrolled Animals Checkboxes */}
            {animals.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <span className="font-semibold">
                  Enrolled {speciesProfile.name} Livestock ({projectDraft.linkedAnimalIds.length}{' '}
                  selected)
                </span>
                <div className="max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  {animals.map((a) => {
                    const checked = projectDraft.linkedAnimalIds.includes(a.id);
                    return (
                      <label
                        key={a.id}
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setProjectDraft((prev) => ({
                              ...prev,
                              linkedAnimalIds: e.target.checked
                                ? [...prev.linkedAnimalIds, a.id]
                                : prev.linkedAnimalIds.filter((x) => x !== a.id),
                            }));
                          }}
                          className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                        />
                        <span className="truncate">
                          {a.name} {a.tattoo ? `(${a.tattoo})` : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block space-y-1 text-xs">
              <span className="font-semibold">Project Goals &amp; Reflection</span>
              <textarea
                rows={2}
                value={projectDraft.goalsAndReflection}
                onChange={(e) =>
                  setProjectDraft((prev) => ({ ...prev, goalsAndReflection: e.target.value }))
                }
                placeholder="Learning objectives, husbandry skills mastered, and project takeaways..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              />
            </label>

            <label className="block space-y-1 text-xs">
              <span className="font-semibold">Fair, Showmanship &amp; Community Service Notes</span>
              <textarea
                rows={2}
                value={projectDraft.showAndCommunityNotes}
                onChange={(e) =>
                  setProjectDraft((prev) => ({
                    ...prev,
                    showAndCommunityNotes: e.target.value,
                  }))
                }
                placeholder="County fair classes, demonstrations, showmanship placements..."
                className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={projectSubmitLock.isSubmitting}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                {projectSubmitLock.isSubmitting ? 'Saving...' : 'Save Project Book'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE / PDF 4-H / FFA COMPLETION REPORT MODAL */}
      {reportPreview && (
        <PrintPreviewModal
          title={reportPreview.title}
          filename={reportPreview.filename}
          htmlContent={reportPreview.htmlContent}
          onClose={() => setReportPreview(null)}
        />
      )}
    </div>
  );
}
```

## `src/components/ExternalImporterPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * External Platform Importer & HerdBoss Two-ZIP Staging Panel (`ExternalImporterPanel`).
 *
 * Supports:
 * 1. Multi-ZIP / CSV / JSON staging (e.g. HerdBoss Part 1 + Part 2 archives).
 * 2. Instant-open Default Species Combobox (1-tap dropdown selection of all configured/predefined
 *    species PLUS free-typing for any custom livestock species not in the list).
 * 3. Inline schedule customization whenever non-predefined / custom livestock species are imported.
 * 4. Preexisting animal matching & per-field contradiction resolution (Keep Current vs Use Incoming
 *    vs Combine Notes, plus 1-click bulk actions).
 * 5. Automatic WebP downscaling, EXIF stripping, and thumbnail generation for incoming archive photos.
 */

import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileArchive,
  FileSpreadsheet,
  FolderUp,
  ImageOff,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { readBlobAsArrayBuffer } from '../utils/es2018Shims';
import { analyzeBarnAnimalConflicts } from '../core/animalConflicts';
import {
  DeviceCapabilityAssessment,
  evaluateBarnWorkloadForTier,
} from '../core/deviceCapability';
import {
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import {
  AnimalConflictFieldKey,
  buildInitialConflictSelections,
  ConflictSelectionMap,
  FieldResolutionChoice,
  makeConflictSelectionKey,
} from '../core/importers/conflictResolver';
import {
  CSV_TARGET_FIELD_OPTIONS,
  makeCsvColumnOverrideKey,
} from '../core/importers/csvColumnMapper';
import { buildStarterCsvTemplate } from '../core/importers/csvStarterTemplate';
import {
  CsvColumnMappingSelection,
  CustomSpeciesImportOverride,
  PlatformImportPreview,
  RawArchiveInput,
} from '../core/importers/importerTypes';
import {
  getPlatformImporterById,
  PLATFORM_IMPORTERS,
} from '../core/importers/registry';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  isAnimalArchived,
  isSameSpecies,
  PREDEFINED_SPECIES_PRESETS,
} from '../core/models';
import {
  BatchImportPhotoProgress,
  optimizeStagedImporterPhotos,
} from '../storage/webImageOptimizer';
import { parseExternalImportOffThread } from '../storage/offThreadWorkerClient';
import {
  formatReadableByteLimit,
  MAX_CSV_TEXT_BYTES,
  MAX_EXTERNAL_IMPORT_FILES,
  MAX_EXTERNAL_IMPORT_TOTAL_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { copyTextWithFallback, downloadTextFile } from '../utils/webFileActions';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../utils/comboboxNav';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { ImageCompressionNotice } from './ImageCompressionNotice';

interface ExternalImporterPanelProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  deviceCapabilityAssessment?: DeviceCapabilityAssessment;
  externalOcrPreview?: {
    key: string;
    preview: PlatformImportPreview;
  } | null;
  onClearExternalOcrPreview?: () => void;
  onCommitImport: (
    preview: PlatformImportPreview,
    optimizedPhotos: AnimalPhoto[],
    conflictSelections: ConflictSelectionMap
  ) => Promise<void>;
}

export function ExternalImporterPanel({
  snapshot,
  activeSpeciesName,
  deviceCapabilityAssessment,
  externalOcrPreview = null,
  onClearExternalOcrPreview,
  onCommitImport,
}: ExternalImporterPanelProps) {
  const baseId = useId();
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>(
    PLATFORM_IMPORTERS[0].id
  );
  const [fallbackSpecies, setFallbackSpecies] = useState<string>(
    activeSpeciesName || snapshot.settings.defaultSpecies || 'Rabbit'
  );
  const [speciesMenuOpen, setSpeciesMenuOpen] = useState<boolean>(false);
  const [isFilteringSpecies, setIsFilteringSpecies] = useState<boolean>(false);
  const [speciesActiveIndex, setSpeciesActiveIndex] = useState<number>(-1);

  const [customSpeciesOverrides, setCustomSpeciesOverrides] = useState<
    Record<string, CustomSpeciesImportOverride>
  >({});
  const [conflictSelections, setConflictSelections] = useState<ConflictSelectionMap>({});
  const [expandedConflictIds, setExpandedConflictIds] = useState<Record<string, boolean>>({});
  const [archiveOverrides, setArchiveOverrides] = useState<Record<string, boolean>>({});
  const [showImportLifecycleList, setShowImportLifecycleList] = useState<boolean>(false);

  const [stagedArchives, setStagedArchives] = useState<RawArchiveInput[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [csvColumnMapping, setCsvColumnMapping] = useState<
    Record<string, CsvColumnMappingSelection>
  >({});
  const [createPlaceholdersForUnlinked, setCreatePlaceholdersForUnlinked] =
    useState<boolean>(true);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [manualCopyDiagnostic, setManualCopyDiagnostic] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importAndOptimizePhotos, setImportAndOptimizePhotos] = useState<boolean>(true);
  const [importPreset, setImportPreset] = useState<ImageOptimizationPresetId>(
    snapshot.settings.imageOptimizationPreset || 'balanced'
  );
  const [photoProgress, setPhotoProgress] = useState<BatchImportPhotoProgress | null>(null);
  const [notePhotoFilenames, setNotePhotoFilenames] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const speciesComboRef = useRef<HTMLDivElement | null>(null);
  const speciesInputRef = useRef<HTMLInputElement | null>(null);
  const speciesOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const importer = getPlatformImporterById(selectedPlatformId);

  useEffect(() => {
    if (snapshot.settings.imageOptimizationPreset) {
      setImportPreset(snapshot.settings.imageOptimizationPreset);
    }
  }, [snapshot.settings.imageOptimizationPreset]);

  // Close Default Species dropdown when clicking outside
  useEffect(() => {
    if (!speciesMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        speciesComboRef.current &&
        e.target instanceof Node &&
        !speciesComboRef.current.contains(e.target)
      ) {
        setSpeciesMenuOpen(false);
        setIsFilteringSpecies(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [speciesMenuOpen]);

  // Build combined list of configured species + any predefined presets not currently in snapshot
  const dropdownSpeciesOptions = useMemo(() => {
    const list: Array<{
      name: string;
      subtitle: string;
      isCustomConfigured: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const sp of snapshot.speciesProfiles) {
      const key = sp.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const isPreset = PREDEFINED_SPECIES_PRESETS.some((p) => isSameSpecies(p.name, sp.name));
      list.push({
        name: sp.name,
        subtitle: `${sp.maleLabel} · ${sp.femaleLabel} · ${sp.offspringLabel} · ${sp.gestationDays}d`,
        isCustomConfigured: !isPreset,
      });
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const key = preset.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: preset.name,
        subtitle: `${preset.maleLabel} · ${preset.femaleLabel} · ${preset.offspringLabel} · ${preset.gestationDays}d`,
        isCustomConfigured: false,
      });
    }

    if (!isFilteringSpecies || !fallbackSpecies.trim()) {
      return list;
    }

    const q = fallbackSpecies.trim().toLowerCase();
    const matching = list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    );
    const others = list.filter(
      (item) =>
        !item.name.toLowerCase().includes(q) && !item.subtitle.toLowerCase().includes(q)
    );
    return [...matching, ...others];
  }, [snapshot.speciesProfiles, fallbackSpecies, isFilteringSpecies]);

  const typedSpeciesIsBrandNew = useMemo(() => {
    const clean = fallbackSpecies.trim();
    if (!clean) return false;
    const inConfigured = snapshot.speciesProfiles.some((sp) => isSameSpecies(sp.name, clean));
    const inPresets = PREDEFINED_SPECIES_PRESETS.some((p) => isSameSpecies(p.name, clean));
    return !inConfigured && !inPresets;
  }, [fallbackSpecies, snapshot.speciesProfiles]);

  const speciesDisplayOptions = useMemo(() => {
    const items: Array<
      | { kind: 'custom'; name: string }
      | { kind: 'preset'; name: string; subtitle: string; isCustomConfigured: boolean }
    > = [];
    if (typedSpeciesIsBrandNew && fallbackSpecies.trim()) {
      items.push({ kind: 'custom', name: fallbackSpecies.trim() });
    }
    for (const opt of dropdownSpeciesOptions) {
      items.push({ kind: 'preset', ...opt });
    }
    return items;
  }, [typedSpeciesIsBrandNew, fallbackSpecies, dropdownSpeciesOptions]);

  useEffect(() => {
    if (!speciesMenuOpen) {
      setSpeciesActiveIndex(-1);
      return;
    }
    setSpeciesActiveIndex((prev) => clampComboboxIndex(prev, speciesDisplayOptions.length));
  }, [speciesMenuOpen, speciesDisplayOptions.length]);

  useEffect(() => {
    if (!speciesMenuOpen || speciesActiveIndex < 0) return;
    speciesOptionRefs.current[speciesActiveIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [speciesMenuOpen, speciesActiveIndex]);

  const handleStageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParseError(null);
    try {
      const stagedCount = stagedArchives.length;
      if (stagedCount + fileList.length > MAX_EXTERNAL_IMPORT_FILES) {
        setParseError(
          `You can stage up to ${MAX_EXTERNAL_IMPORT_FILES} import files at once to protect mobile memory.`
        );
        return;
      }

      let cumulativeBytes = stagedArchives.reduce((sum, item) => sum + item.bytes.byteLength, 0);
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const isZip = f.name.toLowerCase().endsWith('.zip');
        const check = validateUploadFileSize(
          f.name,
          f.size,
          isZip ? MAX_ZIP_ARCHIVE_BYTES : MAX_CSV_TEXT_BYTES,
          isZip ? 'an import .ZIP archive' : 'an import table / pedigree file'
        );
        if (!check.ok) {
          setParseError(check.error);
          return;
        }
        cumulativeBytes += f.size;
        if (cumulativeBytes > MAX_EXTERNAL_IMPORT_TOTAL_BYTES) {
          setParseError(
            `Combined staged files exceed the ${formatReadableByteLimit(MAX_EXTERNAL_IMPORT_TOTAL_BYTES)} mobile memory limit. Stage fewer or smaller files.`
          );
          return;
        }
      }

      const additions: RawArchiveInput[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const buf = await readBlobAsArrayBuffer(f);
        additions.push({
          fileName: f.name,
          bytes: new Uint8Array(buf),
        });
      }
      onClearExternalOcrPreview?.();
      setStagedArchives((prev) => {
        const next = [...prev];
        for (const add of additions) {
          const dupIdx = next.findIndex((x) => x.fileName === add.fileName);
          if (dupIdx >= 0) next[dupIdx] = add;
          else next.push(add);
        }
        return next;
      });
    } catch (err: any) {
      setParseError(err?.message || 'Could not read selected archive file(s).');
    }
  };

  const [archivePreview, setArchivePreview] = useState<PlatformImportPreview | null>(null);
  const [previewParseError, setPreviewParseError] = useState<string | null>(null);
  const [isParsingArchive, setIsParsingArchive] = useState(false);
  const parseRequestSeqRef = useRef(0);

  useEffect(() => {
    if (externalOcrPreview?.key) {
      setStagedArchives([]);
      setCsvColumnMapping({});
      setConflictSelections({});
      setArchiveOverrides({});
      setParseError(null);
    }
  }, [externalOcrPreview?.key]);

  useEffect(() => {
    const reqId = ++parseRequestSeqRef.current;
    if (stagedArchives.length === 0) {
      setArchivePreview(null);
      setPreviewParseError(null);
      setIsParsingArchive(false);
      return;
    }

    let cancelled = false;
    setIsParsingArchive(true);
    setPreviewParseError(null);

    void parseExternalImportOffThread(importer.id, stagedArchives, snapshot, {
      fallbackSpeciesName: fallbackSpecies.trim() || 'Rabbit',
      customSpeciesOverrides,
      appendDeferredImageFilenamesToNotes: notePhotoFilenames,
      csvColumnMapping:
        Object.keys(csvColumnMapping).length > 0 ? csvColumnMapping : undefined,
      createPlaceholderAncestorsForUnlinked: createPlaceholdersForUnlinked,
    })
      .then((parsed) => {
        if (cancelled || parseRequestSeqRef.current !== reqId) return;
        setArchivePreview(parsed);
        setPreviewParseError(null);
      })
      .catch((err: any) => {
        if (cancelled || parseRequestSeqRef.current !== reqId) return;
        setArchivePreview(null);
        setPreviewParseError(err?.message || 'Failed to unpack or parse archive.');
      })
      .finally(() => {
        if (!cancelled && parseRequestSeqRef.current === reqId) {
          setIsParsingArchive(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    stagedArchives,
    importer.id,
    snapshot,
    fallbackSpecies,
    customSpeciesOverrides,
    notePhotoFilenames,
    csvColumnMapping,
    createPlaceholdersForUnlinked,
  ]);

  const preview = stagedArchives.length > 0 ? archivePreview : externalOcrPreview?.preview ?? null;
  const effectiveParseError = parseError || previewParseError;

  // Seed default choices for any newly detected preexisting animal contradictions without clobbering user picks
  useEffect(() => {
    if (!preview || preview.conflicts.length === 0) {
      return;
    }
    const defaults = buildInitialConflictSelections(preview.conflicts);
    setConflictSelections((prev) => {
      const next: ConflictSelectionMap = { ...defaults };
      for (const [key, val] of Object.entries(prev)) {
        if (key in next) {
          next[key] = val;
        }
      }
      return next;
    });
    setExpandedConflictIds((prev) => {
      const next = { ...prev };
      preview.conflicts.forEach((c, idx) => {
        if (next[c.animalId] === undefined) {
          // Auto-expand all when <= 5 conflicts, or the first 2 when larger
          next[c.animalId] = preview.conflicts.length <= 5 || idx < 2;
        }
      });
      return next;
    });
  }, [preview]);

  const rawStagedPhotoBytes = useMemo(() => {
    if (!preview) return 0;
    return preview.stagedPhotos.reduce((acc, p) => acc + p.bytes.byteLength, 0);
  }, [preview]);

  const totalContradictingFieldsCount = useMemo(() => {
    if (!preview) return 0;
    return preview.conflicts.reduce((acc, c) => acc + c.contradictions.length, 0);
  }, [preview]);

  const previewDataIntegritySummary = useMemo(() => {
    if (!preview || preview.animals.length === 0) return null;
    const incomingIds = new Set(preview.animals.map((a) => a.id));
    const combined = new Map(snapshot.animals.map((a) => [a.id, a]));
    for (const a of preview.animals) {
      combined.set(a.id, a);
    }
    const summaries = analyzeBarnAnimalConflicts(Array.from(combined.values()));
    let dupCount = 0;
    let sexMismatchCount = 0;
    for (const summary of summaries.values()) {
      if (!summary.hasActiveConflict) continue;
      const involvesImport =
        incomingIds.has(summary.animalId) ||
        summary.duplicateTattooPeers.some((p) => incomingIds.has(p.peer.id)) ||
        (summary.sireSexMismatch ? incomingIds.has(summary.sireSexMismatch.parent.id) : false) ||
        (summary.damSexMismatch ? incomingIds.has(summary.damSexMismatch.parent.id) : false);
      if (!involvesImport) continue;
      if (summary.activeKinds.includes('duplicate_tattoo')) dupCount++;
      if (summary.activeKinds.includes('parent_sex_mismatch')) sexMismatchCount++;
    }
    if (dupCount === 0 && sexMismatchCount === 0) return null;
    return { dupCount, sexMismatchCount };
  }, [preview, snapshot.animals]);

  const updateCustomSpeciesField = (
    speciesName: string,
    patch: Partial<CustomSpeciesImportOverride>
  ) => {
    const key = speciesName.trim().toLowerCase();
    setCustomSpeciesOverrides((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  const setFieldChoice = (
    animalId: string,
    field: AnimalConflictFieldKey,
    choice: FieldResolutionChoice
  ) => {
    setConflictSelections((prev) => ({
      ...prev,
      [makeConflictSelectionKey(animalId, field)]: choice,
    }));
  };

  const setAllChoicesForAnimal = (animalId: string, target: 'existing' | 'incoming') => {
    if (!preview) return;
    const found = preview.conflicts.find((c) => c.animalId === animalId);
    if (!found) return;
    setConflictSelections((prev) => {
      const next = { ...prev };
      for (const item of found.contradictions) {
        next[makeConflictSelectionKey(animalId, item.field)] = target;
      }
      return next;
    });
  };

  const setAllChoicesBulk = (target: 'existing' | 'incoming') => {
    if (!preview) return;
    setConflictSelections((prev) => {
      const next = { ...prev };
      for (const c of preview.conflicts) {
        for (const item of c.contradictions) {
          next[makeConflictSelectionKey(c.animalId, item.field)] = target;
        }
      }
      return next;
    });
  };

  const copiedReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedReportTimerRef.current !== null) {
        clearTimeout(copiedReportTimerRef.current);
      }
    };
  }, []);

  const handleCopyDiagnostic = async () => {
    if (!preview) return;
    const mode = await copyTextWithFallback(preview.schemaDiagnosticReport);
    if (mode !== 'unsupported') {
      setManualCopyDiagnostic(false);
      setCopiedReport(true);
      if (copiedReportTimerRef.current !== null) {
        clearTimeout(copiedReportTimerRef.current);
      }
      copiedReportTimerRef.current = setTimeout(() => {
        copiedReportTimerRef.current = null;
        setCopiedReport(false);
      }, 2500);
      return;
    }
    setCopiedReport(false);
    setManualCopyDiagnostic(true);
  };

  const handleDownloadStarterCsvTemplate = async () => {
    setParseError(null);
    setTemplateNotice(null);
    try {
      const targetSpecies =
        fallbackSpecies.trim() || activeSpeciesName || snapshot.settings.defaultSpecies || 'Rabbit';
      const template = buildStarterCsvTemplate(targetSpecies, snapshot.speciesProfiles);
      await downloadTextFile(template.filename, template.content, 'text/csv;charset=utf-8');
      setTemplateNotice(
        `Downloaded ${template.filename} with standard columns (${template.headers.slice(0, 11).join(', ')}) and 3 linked sample rows. Fill it out in Excel or Google Sheets, then upload it using Universal Pedigree / Spreadsheets.`
      );
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : 'Could not download Starter CSV Template.'
      );
    }
  };

  const handleCsvColumnSelectionChange = (
    entryPath: string,
    header: string,
    autoMatchedField: string,
    nextValue: string
  ) => {
    const key = makeCsvColumnOverrideKey(entryPath, header);
    setCsvColumnMapping((prev) => {
      const next = { ...prev };
      if (nextValue === '') {
        if (autoMatchedField) {
          next[key] = '__ignore__';
        } else {
          delete next[key];
        }
      } else if (nextValue === autoMatchedField) {
        delete next[key];
      } else {
        next[key] = nextValue as CsvColumnMappingSelection;
      }
      return next;
    });
  };

  const handleCommit = async () => {
    if (!preview || isImporting) return;
    setIsImporting(true);
    setParseError(null);
    try {
      let optimizedPhotos: AnimalPhoto[] = [];
      if (importAndOptimizePhotos && preview.stagedPhotos.length > 0) {
        setPhotoProgress({
          completed: 0,
          total: preview.stagedPhotos.length,
          savedBytesSoFar: 0,
        });
        const batchResult = await optimizeStagedImporterPhotos(
          preview.stagedPhotos,
          importPreset,
          (prog) => setPhotoProgress(prog)
        );
        optimizedPhotos = batchResult.photos;
      }

      const previewToCommit: PlatformImportPreview =
        Object.keys(archiveOverrides).length > 0
          ? {
              ...preview,
              animals: preview.animals.map((a) =>
                a.id in archiveOverrides ? { ...a, archived: archiveOverrides[a.id] } : a
              ),
            }
          : preview;

      await onCommitImport(previewToCommit, optimizedPhotos, conflictSelections);
      setStagedArchives([]);
      setCsvColumnMapping({});
      setConflictSelections({});
      setArchiveOverrides({});
      setShowImportLifecycleList(false);
      setShowDiagnostics(false);
      onClearExternalOcrPreview?.();
    } catch (err: any) {
      setParseError(err?.message || 'Failed while optimizing or importing archive data.');
    } finally {
      setPhotoProgress(null);
      setIsImporting(false);
    }
  };

  const hasImportableRecords = Boolean(
    preview &&
      (preview.animals.length > 0 ||
        preview.stagedPhotos.length > 0 ||
        preview.breedings.length > 0 ||
        preview.careLogs.length > 0 ||
        preview.cages.length > 0 ||
        preview.tasks.length > 0)
  );

  return (
    <section
      id="external-platform-importer"
      className="bg-[var(--barn-surface)] border border-[var(--barn-sage)]/50 rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">
              External Platform Importer
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold">
              {importer.badge}
            </span>
          </div>
          <p className="text-xs text-[var(--barn-muted)] mt-1">
            {importer.summary}
          </p>
        </div>
        <FolderUp className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* Platform Selector + Instant-Open Default Species Combobox */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${baseId}-platform`}
            className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
          >
            Source Platform
          </label>
          <select
            id={`${baseId}-platform`}
            value={selectedPlatformId}
            onChange={(e) => {
              setSelectedPlatformId(e.target.value);
              setCsvColumnMapping({});
            }}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-semibold"
          >
            {PLATFORM_IMPORTERS.map((imp) => (
              <option key={imp.id} value={imp.id}>
                {imp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Accessible Combobox: Drops down immediately on click/tap AND allows typing custom species */}
        <div
          ref={speciesComboRef}
          onBlur={(e) => {
            if (!speciesComboRef.current?.contains(e.relatedTarget as Node | null)) {
              setSpeciesMenuOpen(false);
              setIsFilteringSpecies(false);
              setSpeciesActiveIndex(-1);
            }
          }}
          className="relative"
        >
          <label
            htmlFor="importer-default-species-input"
            className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
          >
            Default Species (Pick from list or type custom)
          </label>
          <div className="relative flex items-center">
            <input
              id="importer-default-species-input"
              ref={speciesInputRef}
              type="text"
              role="combobox"
              aria-expanded={speciesMenuOpen}
              aria-controls={speciesMenuOpen ? 'importer-species-listbox' : undefined}
              aria-activedescendant={
                speciesMenuOpen && speciesActiveIndex >= 0 && speciesDisplayOptions[speciesActiveIndex]
                  ? `importer-species-opt-${speciesActiveIndex}`
                  : undefined
              }
              aria-autocomplete="list"
              value={fallbackSpecies}
              onFocus={() => {
                setIsFilteringSpecies(false);
                setSpeciesMenuOpen(true);
              }}
              onClick={() => {
                setSpeciesMenuOpen(true);
              }}
              onChange={(e) => {
                setFallbackSpecies(e.target.value);
                setIsFilteringSpecies(true);
                setSpeciesMenuOpen(true);
                setSpeciesActiveIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && speciesMenuOpen) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSpeciesMenuOpen(false);
                  setIsFilteringSpecies(false);
                  setSpeciesActiveIndex(-1);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const next = stepEnabledComboboxIndex(
                    speciesMenuOpen ? speciesActiveIndex : -1,
                    speciesDisplayOptions.length,
                    e.key
                  );
                  if (!speciesMenuOpen) {
                    setIsFilteringSpecies(false);
                    setSpeciesMenuOpen(true);
                  }
                  setSpeciesActiveIndex(next);
                } else if (
                  (e.key === 'Home' || e.key === 'End') &&
                  speciesMenuOpen &&
                  speciesDisplayOptions.length > 0
                ) {
                  e.preventDefault();
                  setSpeciesActiveIndex(
                    stepEnabledComboboxIndex(speciesActiveIndex, speciesDisplayOptions.length, e.key)
                  );
                } else if (e.key === 'Enter' && speciesMenuOpen) {
                  const highlighted =
                    speciesActiveIndex >= 0 ? speciesDisplayOptions[speciesActiveIndex] : undefined;
                  if (highlighted) {
                    e.preventDefault();
                    setFallbackSpecies(highlighted.name);
                    setSpeciesMenuOpen(false);
                    setIsFilteringSpecies(false);
                    setSpeciesActiveIndex(-1);
                  }
                }
              }}
              placeholder="Select or type any species (e.g. Goat, Yak, Duck)..."
              className="w-full min-h-[40px] pl-3 pr-9 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={speciesMenuOpen ? 'Close species list' : 'Open species list'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsFilteringSpecies(false);
                setSpeciesMenuOpen((open) => {
                  const next = !open;
                  if (next) {
                    speciesInputRef.current?.focus();
                  } else {
                    setSpeciesActiveIndex(-1);
                  }
                  return next;
                });
              }}
              className="absolute right-1 top-1 bottom-1 w-7 rounded-md flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] transition-colors"
            >
              {speciesMenuOpen ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {speciesMenuOpen && (
            <div
              id="importer-species-listbox"
              role="listbox"
              aria-label="Default species options"
              className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] shadow-xl divide-y divide-[var(--barn-border)]"
            >
              {speciesDisplayOptions.map((opt, idx) => {
                const optionId = `importer-species-opt-${idx}`;
                const isHighlighted = idx === speciesActiveIndex;

                if (opt.kind === 'custom') {
                  return (
                    <button
                      key={`__custom__:${opt.name}`}
                      id={optionId}
                      ref={(el) => {
                        speciesOptionRefs.current[idx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={true}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setSpeciesActiveIndex(idx)}
                      onClick={() => {
                        setFallbackSpecies(opt.name);
                        setSpeciesMenuOpen(false);
                        setIsFilteringSpecies(false);
                        setSpeciesActiveIndex(-1);
                      }}
                      className={`w-full text-left px-3 py-2.5 bg-[var(--barn-sage-tint)] hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 text-xs ${
                        isHighlighted ? 'ring-2 ring-inset ring-[var(--barn-sage)]' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--barn-ink)] truncate">
                          + Use Custom Species: &ldquo;{opt.name}&rdquo;
                        </div>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          Not in predefined list — schedule will be created automatically
                        </div>
                      </div>
                      <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    </button>
                  );
                }

                const isSelected = isSameSpecies(fallbackSpecies, opt.name);
                return (
                  <button
                    key={opt.name}
                    id={optionId}
                    ref={(el) => {
                      speciesOptionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSpeciesActiveIndex(idx)}
                    onClick={() => {
                      setFallbackSpecies(opt.name);
                      setSpeciesMenuOpen(false);
                      setIsFilteringSpecies(false);
                      setSpeciesActiveIndex(-1);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                      isSelected
                        ? 'bg-[var(--barn-subtle)] font-semibold'
                        : 'hover:bg-[var(--barn-subtle)]/70'
                    } ${
                      isHighlighted ? 'ring-2 ring-inset ring-[var(--barn-sage)] bg-[var(--barn-subtle)]' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{opt.name}</span>
                        {opt.isCustomConfigured && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[10px] text-[var(--barn-muted)]">
                            Custom
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--barn-muted)] truncate">
                        {opt.subtitle}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}

              <div className="px-3 py-2 bg-[var(--barn-canvas)] text-[11px] text-[var(--barn-muted)]">
                Tip: Type any custom livestock name above (e.g. Kunekune, Yak, Duck, Donkey) if not
                listed.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-[var(--barn-muted)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl px-3.5 py-2.5 space-y-1">
        <p>{importer.instructions}</p>
        <p className="text-[11px]">
          <strong className="text-[var(--barn-ink)]">Smart Merge &amp; Image Compression:</strong>{' '}
          New custom species get a dedicated schedule, preexisting barn animals let you resolve any
          contradicting fields side-by-side, and incoming photos are automatically WebP-optimized.
        </p>
      </div>

      {/* Multi-ZIP File Staging Controls */}
      <div className="space-y-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={importer.acceptedExtensions.join(',')}
          className="hidden"
          onChange={(e) => {
            void handleStageFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {importer.id === 'universal-pedigree'
              ? stagedArchives.length === 0
                ? 'Select CSV / .HTM / JSON / .ZIP File(s)'
                : `Add Another File (#${stagedArchives.length + 1})`
              : stagedArchives.length === 0
              ? 'Select HerdBoss .ZIP File(s) (1 or Both)'
              : `Add Companion .ZIP (#${stagedArchives.length + 1})`}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleDownloadStarterCsvTemplate();
            }}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Download Starter CSV Template</span>
          </button>

          {(stagedArchives.length > 0 || externalOcrPreview) && (
            <button
              type="button"
              onClick={() => {
                setStagedArchives([]);
                setCsvColumnMapping({});
                setConflictSelections({});
                setParseError(null);
                onClearExternalOcrPreview?.();
              }}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]"
            >
              {stagedArchives.length > 0 ? 'Clear Staged Files' : 'Clear Staged OCR Scan'}
            </button>
          )}
        </div>

        {stagedArchives.length === 0 && externalOcrPreview && (
          <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong className="text-[var(--barn-ink)]">Staged from Paper / PDF OCR Scanner:</strong>{' '}
              <span className="font-mono">{externalOcrPreview.preview.archiveNames.join(', ')}</span>
            </div>
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              {externalOcrPreview.preview.animals.length} animal(s) ready in review queue below
            </span>
          </div>
        )}

        {templateNotice && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/60 text-xs flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-[var(--barn-ink)]">{templateNotice}</span>
            {selectedPlatformId !== 'universal-pedigree' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlatformId('universal-pedigree');
                  setCsvColumnMapping({});
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] shrink-0"
              >
                Switch to Spreadsheet Importer
              </button>
            )}
          </div>
        )}

        {/* Staged ZIP Tray */}
        {stagedArchives.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[var(--barn-muted)]">
              Staged Export Archives ({stagedArchives.length}):
            </div>
            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
              {stagedArchives.map((arch, idx) => (
                <div
                  key={arch.fileName}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileArchive
                      className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[var(--barn-muted)] shrink-0">
                      ZIP #{idx + 1}:
                    </span>
                    <span className="font-medium truncate">{arch.fileName}</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] shrink-0">
                      ({formatByteSizePure(arch.bytes.byteLength)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setStagedArchives((prev) =>
                        prev.filter((x) => x.fileName !== arch.fileName)
                      )
                    }
                    aria-label={`Remove ${arch.fileName}`}
                    className="min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isParsingArchive && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs font-medium"
        >
          Unpacking and scanning archive in background worker...
        </div>
      )}

      {effectiveParseError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium"
        >
          {effectiveParseError}
        </div>
      )}

      {/* Live Multi-ZIP Import Preview */}
      {preview && (
        <div className="border-t border-[var(--barn-border)] pt-4 space-y-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Animals &amp; Ancestors</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.animals.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.parentLinksResolved} parent links
                {preview.matchedExistingAnimalsCount > 0
                  ? ` · ${preview.matchedExistingAnimalsCount} existing`
                  : ''}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Breedings / Litters</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.breedings.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.cages.length} groups/locations
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Weights &amp; Care Logs</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.careLogs.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.tasks.length} scheduled chores
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Matched Photos</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.stagedPhotos.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.stagedPhotos.length > 0
                  ? `${formatByteSizePure(rawStagedPhotoBytes)} raw`
                  : preview.deferredMediaCount > 0
                    ? `${preview.deferredMediaCount} unmatched`
                    : 'None in ZIP'}
              </div>
            </div>
          </div>

          {preview.speciesDetected.length > 0 && (
            <div className="text-xs text-[var(--barn-muted)]">
              <strong>Isolated Species Detected:</strong>{' '}
              <span className="text-[var(--barn-ink)]">
                {preview.speciesDetected.join(', ')}
              </span>
            </div>
          )}

          {/* Interactive Spreadsheet Column-Mapping Preview (Non-HerdBoss CSV/TSV) */}
          {preview.csvTables && preview.csvTables.length > 0 && (() => {
            const totalCols = preview.csvTables.reduce((sum, t) => sum + t.columns.length, 0);
            const unmappedCols = preview.csvTables.reduce(
              (sum, t) => sum + t.columns.filter((c) => !c.assignedField).length,
              0
            );
            const matchedCols = totalCols - unmappedCols;
            const hasUserOverrides = Object.keys(csvColumnMapping).length > 0;
            const identityOptions = CSV_TARGET_FIELD_OPTIONS.filter((o) => o.group === 'identity');
            const pedigreeOptions = CSV_TARGET_FIELD_OPTIONS.filter((o) => o.group === 'pedigree');
            const detailOptions = CSV_TARGET_FIELD_OPTIONS.filter((o) => o.group === 'details');

            return (
              <div
                role="region"
                aria-label="Spreadsheet Column Mapping"
                className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/60 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <FileSpreadsheet
                      className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {unmappedCols > 0
                          ? `We matched ${matchedCols} of ${totalCols} columns — map the remaining ${unmappedCols}`
                          : `We matched all ${matchedCols} spreadsheet columns`}
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)]">
                        Adjust any column mapping below before merging. Sample cell values are shown
                        for each header.
                      </p>
                    </div>
                  </div>
                  {hasUserOverrides && (
                    <button
                      type="button"
                      onClick={() => setCsvColumnMapping({})}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      Reset Auto-Mapping
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {preview.csvTables.map((table) => {
                    const sortedCols = [...table.columns].sort((a, b) => {
                      const aUnmapped = a.assignedField ? 1 : 0;
                      const bUnmapped = b.assignedField ? 1 : 0;
                      return aUnmapped - bUnmapped;
                    });
                    return (
                      <div
                        key={table.entryPath}
                        className="rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-[var(--barn-subtle)]/40 border-b border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-semibold text-[var(--barn-ink)] truncate">
                            {table.entryPath}
                          </span>
                          <span className="text-[var(--barn-muted)]">
                            {table.rowCount} row{table.rowCount === 1 ? '' : 's'} ·{' '}
                            {table.columns.filter((c) => c.assignedField).length}/
                            {table.columns.length} mapped
                          </span>
                        </div>

                        <div className="max-h-72 overflow-y-auto divide-y divide-[var(--barn-border)]">
                          {sortedCols.map((col, colIdx) => {
                            const selectId = `${baseId}-colmap-${table.entryPath}-${colIdx}`;
                            const isMapped = Boolean(col.assignedField);
                            return (
                              <div
                                key={`${table.entryPath}::${col.header}`}
                                className={`px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                                  !isMapped ? 'bg-[var(--barn-terracotta-tint)]/40' : ''
                                }`}
                              >
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <label
                                      htmlFor={selectId}
                                      className="font-mono font-semibold text-[var(--barn-ink)] truncate"
                                    >
                                      {col.header}
                                    </label>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                        isMapped
                                          ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border border-[var(--barn-sage)]/40'
                                          : 'bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border border-[var(--barn-terracotta)]/50'
                                      }`}
                                    >
                                      {isMapped
                                        ? col.isUserOverride
                                          ? 'Custom Map'
                                          : 'Matched'
                                        : 'Unmapped'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[var(--barn-muted)] truncate">
                                    {col.sampleValues.length > 0
                                      ? `Samples: ${col.sampleValues.join(' · ')}`
                                      : 'No sample values in rows'}
                                  </div>
                                </div>

                                <select
                                  id={selectId}
                                  value={col.assignedField}
                                  onChange={(e) =>
                                    handleCsvColumnSelectionChange(
                                      table.entryPath,
                                      col.header,
                                      col.autoMatchedField,
                                      e.target.value
                                    )
                                  }
                                  className="sm:w-60 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
                                >
                                  <option value="">-- Ignore / Do not import --</option>
                                  <optgroup label="Animal Identity">
                                    {identityOptions.map((opt) => (
                                      <option key={opt.key} value={opt.key}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Parentage & Pedigree">
                                    {pedigreeOptions.map((opt) => (
                                      <option key={opt.key} value={opt.key}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Weight, Registry & Barn Details">
                                    {detailOptions.map((opt) => (
                                      <option key={opt.key} value={opt.key}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Pre-Import Highlighting for Unresolved Sire/Dam Links on Non-HerdBoss CSV Imports */}
          {preview.unresolvedParentLinks && preview.unresolvedParentLinks.length > 0 && (
            <div
              role="region"
              aria-label="Unresolved Sire and Dam Links"
              className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)]/60 border border-[var(--barn-terracotta)] space-y-3 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Unresolved Sire / Dam Links Highlighted ({preview.unresolvedParentLinks.length})
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    These Sire or Dam values did not match any animal row in your CSV or your
                    existing barn herd. Check the column mapping above or choose how to handle them
                    before importing:
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] font-medium text-[var(--barn-ink)] bg-[var(--barn-surface)]/80 px-3 py-2 rounded-lg border border-[var(--barn-border)]">
                <input
                  type="checkbox"
                  checked={createPlaceholdersForUnlinked}
                  onChange={(e) => setCreatePlaceholdersForUnlinked(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Create placeholder ancestor records for unresolved Sire/Dam references (uncheck to
                  leave them unlinked instead of creating stub records)
                </span>
              </label>

              <div className="max-h-52 overflow-y-auto divide-y divide-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                {preview.unresolvedParentLinks.map((link, idx) => (
                  <div
                    key={`${link.entryPath}-${link.rowNumber}-${link.role}-${idx}`}
                    className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[var(--barn-muted)] mr-1.5">
                        Row {link.rowNumber}:
                      </span>
                      <span className="font-semibold text-[var(--barn-ink)]">
                        {link.childName}
                      </span>
                      {link.childTattoo && (
                        <span className="font-mono text-[var(--barn-muted)] ml-1">
                          ({link.childTattoo})
                        </span>
                      )}
                      <span className="mx-1.5 text-[var(--barn-muted)]">&rarr;</span>
                      <span className="font-semibold text-[var(--barn-terracotta)] uppercase">
                        {link.role}
                      </span>{' '}
                      <span className="font-mono bg-[var(--barn-canvas)] px-1.5 py-0.5 rounded border border-[var(--barn-border)]">
                        {link.rawReference}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[10px] font-medium text-[var(--barn-muted)] shrink-0">
                      {link.placeholderCreated ? 'Placeholder Ancestor' : 'Left Unlinked'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewDataIntegritySummary && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex items-start gap-2.5"
            >
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-[var(--barn-ink)]">
                  Conflict Review Notice (Import Allowed Without Data Loss)
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Detected{' '}
                  {[
                    previewDataIntegritySummary.dupCount > 0
                      ? `${previewDataIntegritySummary.dupCount} record(s) with duplicate ID/tattoo`
                      : '',
                    previewDataIntegritySummary.sexMismatchCount > 0
                      ? `${previewDataIntegritySummary.sexMismatchCount} record(s) with parent sex mismatch`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' and ')}
                  . Importing will succeed and flag these profiles &amp; pedigrees for attention so
                  you can locate, review, or ignore them in Herd.
                </p>
              </div>
            </div>
          )}

          {/* Device Capability Memory Caution during Import Preview (Non-Blocking) */}
          {deviceCapabilityAssessment &&
            (() => {
              const projectedPhotos = importAndOptimizePhotos ? preview.stagedPhotos.length : 0;
              const projectedRecords =
                snapshot.animals.length +
                (snapshot.animalPhotos?.length ?? 0) +
                snapshot.breedings.length +
                snapshot.cages.length +
                snapshot.tasks.length +
                snapshot.careLogs.length +
                snapshot.shows.length +
                preview.animals.length +
                preview.breedings.length +
                projectedPhotos;
              const workload = evaluateBarnWorkloadForTier(
                projectedRecords,
                deviceCapabilityAssessment
              );
              const showTier1Warning =
                deviceCapabilityAssessment.tier === 1 &&
                (preview.animals.length > 15 || projectedPhotos > 0);
              if (!showTier1Warning && workload.status === 'ok') return null;

              return (
                <div
                  role="note"
                  className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle
                    className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-1 min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {deviceCapabilityAssessment.definition.shortLabel}: Memory Caution
                    </div>
                    <p className="text-[11px] text-[var(--barn-ink)]">
                      {workload.guidance || deviceCapabilityAssessment.definition.cautionNotice}
                    </p>
                    {importAndOptimizePhotos &&
                      preview.stagedPhotos.length > 0 &&
                      importPreset !== 'compact' && (
                        <button
                          type="button"
                          onClick={() => setImportPreset('compact')}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                        >
                          Switch Import Photos to Compact (960px)
                        </button>
                      )}
                  </div>
                </div>
              );
            })()}

          {/* Non-Active / Archived Detection & Lifecycle Review */}
          {preview.animals.length > 0 && (() => {
            const effectiveArchived = preview.animals.filter((a) =>
              a.id in archiveOverrides ? archiveOverrides[a.id] : isAnimalArchived(a)
            );
            const effectiveActiveCount = preview.animals.length - effectiveArchived.length;
            return (
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Herd Lifecycle Classification:{' '}
                      <span className="font-mono">{effectiveActiveCount}</span> Active ·{' '}
                      <span className="font-mono text-[var(--barn-terracotta)]">
                        {effectiveArchived.length}
                      </span>{' '}
                      Non-Active / Archived
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                      Deceased, sold, retired, or ancestor-only records are automatically tagged as
                      Archived (retained for pedigrees, excluded from active barn tasks).
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-expanded={showImportLifecycleList}
                    onClick={() => setShowImportLifecycleList((v) => !v)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    {showImportLifecycleList ? 'Hide' : 'Review'} Active / Archived (
                    {preview.animals.length})
                  </button>
                </div>

                {showImportLifecycleList && (
                  <div className="max-h-56 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)]">
                    {preview.animals.map((a) => {
                      const isArch =
                        a.id in archiveOverrides
                          ? archiveOverrides[a.id]
                          : isAnimalArchived(a);
                      return (
                        <label
                          key={a.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--barn-subtle)]/40"
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {a.name}{' '}
                              {a.tattoo && (
                                <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                                  ({a.tattoo})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              {a.species} · Status: {a.status}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={isArch}
                              onChange={(e) =>
                                setArchiveOverrides((prev) => ({
                                  ...prev,
                                  [a.id]: e.target.checked,
                                }))
                              }
                              className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                            />
                            <span
                              className={`text-[11px] font-medium ${
                                isArch ? 'text-[var(--barn-terracotta)]' : 'text-[var(--barn-sage)]'
                              }`}
                            >
                              {isArch ? 'Archived' : 'Active'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* New Non-Predefined / Custom Species Schedule Customization Card */}
          {preview.newSpeciesProfiles.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/60 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <SlidersHorizontal
                  className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    New Custom Livestock Species Detected ({preview.newSpeciesProfiles.length})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    {preview.newSpeciesProfiles.length === 1
                      ? `"${preview.newSpeciesProfiles[0].name}" isn't in your configured species yet.`
                      : `These species aren't in your configured barn list yet.`}{' '}
                    Review or customize gestation &amp; terminology below—it will be added to the
                    top of your Home page automatically.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {preview.newSpeciesProfiles.map((newSp, spIdx) => (
                  <div
                    key={newSp.id}
                    className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5"
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>{newSp.name} Biological Schedule</span>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                        Auto-cascades chores &amp; due dates
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-gestation`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Gestation (days)
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-gestation`}
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.gestationDays}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              gestationDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-wean`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Wean (+days)
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-wean`}
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.weanDaysAfterBirth}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              weanDaysAfterBirth: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-rebreed`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Rebreed (+days)
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-rebreed`}
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.rebreedDaysAfterBirth}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              rebreedDaysAfterBirth: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-male`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Male Term
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-male`}
                          type="text"
                          value={newSp.maleLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { maleLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-female`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Female Term
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-female`}
                          type="text"
                          value={newSp.femaleLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { femaleLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-offspring`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Offspring Term
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-offspring`}
                          type="text"
                          value={newSp.offspringLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { offspringLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${baseId}-sp-${spIdx}-birth`}
                          className="block text-[10px] text-[var(--barn-muted)] mb-0.5"
                        >
                          Birth Event
                        </label>
                        <input
                          id={`${baseId}-sp-${spIdx}-birth`}
                          type="text"
                          value={newSp.birthEventLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              birthEventLabel: e.target.value,
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preexisting Animal Clean Enrichment Notice (when matched with zero contradictions) */}
          {preview.matchedExistingAnimalsCount > 0 && preview.conflicts.length === 0 && (
            <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>
                Matched <strong>{preview.matchedExistingAnimalsCount}</strong> preexisting barn
                animal{preview.matchedExistingAnimalsCount === 1 ? '' : 's'} with zero data
                contradictions — any blank fields, pedigree links, logs, and photos will enrich your
                existing records cleanly.
              </span>
            </div>
          )}

          {/* Preexisting Animal Contradiction Resolver UI */}
          {preview.conflicts.length > 0 && (
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)] space-y-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 max-w-xl">
                  <AlertTriangle
                    className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Preexisting Animal Contradictions Detected ({preview.conflicts.length} animal
                      {preview.conflicts.length === 1 ? '' : 's'} · {totalContradictingFieldsCount}{' '}
                      field{totalContradictingFieldsCount === 1 ? '' : 's'})
                    </div>
                    <p className="text-[var(--barn-muted)]">
                      These animals already exist in your barn with different values. Click the
                      value you want to keep for each contradicting field below (or apply a bulk
                      rule).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                  <button
                    type="button"
                    onClick={() => setAllChoicesBulk('existing')}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                  >
                    Keep All Current
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllChoicesBulk('incoming')}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                  >
                    Use All Incoming
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-0.5">
                {preview.conflicts.map((conflict) => {
                  const isExpanded = expandedConflictIds[conflict.animalId] ?? true;
                  return (
                    <div
                      key={conflict.animalId}
                      className="rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden"
                    >
                      <div className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-[var(--barn-subtle)]/40">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() =>
                            setExpandedConflictIds((prev) => ({
                              ...prev,
                              [conflict.animalId]: !isExpanded,
                            }))
                          }
                          className="flex items-center gap-2 text-left min-w-0 flex-1"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[var(--barn-muted)] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--barn-muted)] shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-[var(--barn-ink)]">
                              {conflict.displayName}
                            </span>
                            {conflict.displayTag && (
                              <span className="ml-1.5 font-mono text-[11px] text-[var(--barn-muted)]">
                                ({conflict.displayTag})
                              </span>
                            )}
                            <span className="ml-2 text-[11px] text-[var(--barn-muted)]">
                              {conflict.species} · Matched by {conflict.matchedBy} ·{' '}
                              {conflict.contradictions.length} conflict
                              {conflict.contradictions.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setAllChoicesForAnimal(conflict.animalId, 'existing')}
                            className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[10px] font-medium hover:bg-[var(--barn-subtle)]"
                          >
                            All Current
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllChoicesForAnimal(conflict.animalId, 'incoming')}
                            className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[10px] font-medium hover:bg-[var(--barn-subtle)]"
                          >
                            All Incoming
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 divide-y divide-[var(--barn-border)]">
                          {conflict.contradictions.map((item) => {
                            const selected =
                              conflictSelections[
                                makeConflictSelectionKey(conflict.animalId, item.field)
                              ] || item.defaultChoice;

                            return (
                              <div
                                key={item.field}
                                className="py-2.5 first:pt-0 last:pb-0 space-y-1.5"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[var(--barn-muted)]">
                                  <span>{item.label}</span>
                                  {(item.field === 'genotypeRaw' || item.field === 'rufusLevel') && (
                                    <ColorGeneticsNotice compact />
                                  )}
                                </div>

                                <div
                                  className={`grid grid-cols-1 ${
                                    item.supportsCombine ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                                  } gap-2`}
                                >
                                  {/* Choice 1: Keep Current Barn Data */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFieldChoice(conflict.animalId, item.field, 'existing')
                                    }
                                    className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                      selected === 'existing'
                                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div
                                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                                          selected === 'existing'
                                            ? 'opacity-90'
                                            : 'text-[var(--barn-muted)]'
                                        }`}
                                      >
                                        Current in Barn
                                      </div>
                                      <div className="text-xs font-medium break-words mt-0.5">
                                        {item.existingDisplay}
                                      </div>
                                    </div>
                                    {selected === 'existing' && (
                                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    )}
                                  </button>

                                  {/* Choice 2: Use Incoming Import Data */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFieldChoice(conflict.animalId, item.field, 'incoming')
                                    }
                                    className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                      selected === 'incoming'
                                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div
                                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                                          selected === 'incoming'
                                            ? 'opacity-90'
                                            : 'text-[var(--barn-muted)]'
                                        }`}
                                      >
                                        Incoming Import
                                      </div>
                                      <div className="text-xs font-medium break-words mt-0.5">
                                        {item.incomingDisplay}
                                      </div>
                                    </div>
                                    {selected === 'incoming' && (
                                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    )}
                                  </button>

                                  {/* Choice 3 (Notes): Combine Both */}
                                  {item.supportsCombine && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFieldChoice(conflict.animalId, item.field, 'combine')
                                      }
                                      className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                        selected === 'combine'
                                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div
                                          className={`text-[10px] uppercase tracking-wider font-semibold ${
                                            selected === 'combine'
                                              ? 'opacity-90'
                                              : 'text-[var(--barn-muted)]'
                                          }`}
                                        >
                                          Combine Both
                                        </div>
                                        <div className="text-xs font-medium break-words mt-0.5">
                                          Keep both notes together
                                        </div>
                                      </div>
                                      {selected === 'combine' && (
                                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-Optimize Incoming Animal Photos Panel */}
          {preview.stagedPhotos.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/50 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Camera
                  className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Incoming Animal Photos Ready to Optimize ({preview.stagedPhotos.length})
                  </div>
                  <p className="text-[var(--barn-muted)] leading-relaxed">
                    Matched{' '}
                    <strong className="font-mono text-[var(--barn-ink)]">
                      {preview.stagedPhotos.length}
                    </strong>{' '}
                    photo{preview.stagedPhotos.length === 1 ? '' : 's'} (
                    {formatByteSizePure(rawStagedPhotoBytes)} raw)
                    {preview.animalsWithMultipleImagesCount > 0 && (
                      <>
                        , including{' '}
                        <strong className="font-mono text-[var(--barn-ink)]">
                          {preview.animalsWithMultipleImagesCount}
                        </strong>{' '}
                        animal{preview.animalsWithMultipleImagesCount === 1 ? '' : 's'} with{' '}
                        <strong>multiple gallery photos</strong>
                      </>
                    )}
                    . Each image is automatically resized, stripped of camera metadata, and WebP
                    compressed with a fast herd-list thumbnail.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-[var(--barn-ink)]">
                  <input
                    type="checkbox"
                    checked={importAndOptimizePhotos}
                    onChange={(e) => setImportAndOptimizePhotos(e.target.checked)}
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Optimize &amp; import matched animal photos</span>
                </label>

                {importAndOptimizePhotos && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--barn-muted)]">Compression:</span>
                    <select
                      value={importPreset}
                      onChange={(e) =>
                        setImportPreset(e.target.value as ImageOptimizationPresetId)
                      }
                      aria-label="Importer photo compression preset"
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    >
                      {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} ({preset.typicalSizeHint})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {importAndOptimizePhotos && <ImageCompressionNotice />}

              {photoProgress && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span>
                      Optimizing photo {photoProgress.completed} of {photoProgress.total}...
                    </span>
                    <span className="text-[var(--barn-sage)]">
                      Saved {formatByteSizePure(photoProgress.savedBytesSoFar)}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Optimizing imported animal photos"
                    aria-valuenow={Math.round(
                      (photoProgress.completed / Math.max(1, photoProgress.total)) * 100
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden"
                  >
                    <div
                      className="h-full bg-[var(--barn-sage)] transition-all duration-150"
                      style={{
                        width: `${Math.round(
                          (photoProgress.completed / Math.max(1, photoProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unmatched or Non-Image Media Notice */}
          {preview.deferredMediaCount > 0 && (
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <ImageOff
                  className="w-4 h-4 text-[var(--barn-muted)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-[var(--barn-muted)]">
                  <strong className="font-mono text-[var(--barn-ink)]">
                    {preview.deferredMediaCount}
                  </strong>{' '}
                  additional media file{preview.deferredMediaCount === 1 ? '' : 's'} (
                  {formatByteSizePure(preview.deferredMediaBytes)}) had no matching animal tag/ID or
                  used a non-image format and will be skipped cleanly.
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] text-[var(--barn-muted)]">
                <input
                  type="checkbox"
                  checked={notePhotoFilenames}
                  onChange={(e) => setNotePhotoFilenames(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Append original archive photo filenames to animal text notes as a reference
                  breadcrumb
                </span>
              </label>
            </div>
          )}

          {preview.warnings.map((w, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
            >
              {w}
            </div>
          ))}

          {/* Privacy-Safe ZIP Manifest & Column Header QA Inspector */}
          <div className="border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
            <button
              type="button"
              aria-expanded={showDiagnostics}
              onClick={() => setShowDiagnostics((v) => !v)}
              className="w-full px-3.5 py-2.5 text-xs font-medium flex items-center justify-between hover:bg-[var(--barn-subtle)] transition-colors"
            >
              <span>
                Inspect ZIP Manifest &amp; Detected Columns ({preview.diagnostics.length} tables)
              </span>
              {showDiagnostics ? (
                <ChevronUp className="w-4 h-4 text-[var(--barn-muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--barn-muted)]" />
              )}
            </button>

            {showDiagnostics && (
              <div className="p-3.5 border-t border-[var(--barn-border)] space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    Privacy-safe header summary (contains filenames &amp; column names only—no
                    animal PII)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyDiagnostic}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--barn-subtle)] shrink-0"
                  >
                    {copiedReport ? (
                      <>
                        <Check className="w-3 h-3 text-[var(--barn-sage)]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy QA Schema Report
                      </>
                    )}
                  </button>
                </div>

                {manualCopyDiagnostic ? (
                  <div className="space-y-1.5">
                    <p role="status" className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                      Clipboard access is blocked in this browser — tap the box below to select and
                      copy manually.
                    </p>
                    <textarea
                      readOnly
                      aria-label="Selectable QA schema diagnostic report"
                      value={preview.schemaDiagnosticReport}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      rows={8}
                      className="w-full p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px]"
                    />
                  </div>
                ) : (
                  <pre className="max-h-48 overflow-auto p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] whitespace-pre-wrap">
                    {preview.schemaDiagnosticReport}
                  </pre>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!hasImportableRecords || isImporting}
            onClick={() => {
              void handleCommit();
            }}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
          >
            {isImporting
              ? photoProgress
                ? `Optimizing Photos (${photoProgress.completed}/${photoProgress.total}) & Merging...`
                : 'Merging Into Local SQLite...'
              : `Merge ${preview.animals.length} Animals${
                  preview.conflicts.length > 0
                    ? ` (${preview.conflicts.length} Conflict Choices Applied)`
                    : ''
                }${
                  importAndOptimizePhotos && preview.stagedPhotos.length > 0
                    ? `, ${preview.stagedPhotos.length} Optimized Photos`
                    : ''
                } & ${preview.breedings.length + preview.careLogs.length} Records Into Barn`}
          </button>
        </div>
      )}
    </section>
  );
}
```

## `src/components/FacilityPenBoard.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Visual Hutch-by-Hutch / Cage Row & Pasture Board (`src/components/FacilityPenBoard.tsx`).
 *
 * Groups physical pens by barn section/row, displays live capacity warnings (`IMP-028`),
 * links pens to feedlot inventories with quick stock adjustments, tracks recurring maintenance
 * schedules with 1-click completion + Master Task List scheduling, and launches QR-coded
 * cage card printing (`IMP-035` / `IMP-036`) for single pens or entire barn rows.
 */

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  Package,
  Plus,
  QrCode,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CageAssignmentCapacityWarning,
  evaluateCageAssignmentCapacityWarning,
  normalizeCageLabelKey,
} from '../core/barnAlerts';
import {
  buildCageMaintenanceTaskDraft,
  FacilityBoardFilter,
  FacilityBoardModel,
  FacilityPenCardModel,
  formatHousingUnitTypeLabel,
  matchesFacilityBoardFilter,
} from '../core/facilityBoard';
import {
  Animal,
  BarnTask,
  CageLocation,
  FeedBatch,
  HOUSING_UNIT_TYPES,
  HousingUnitType,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock } from '../utils/useAsyncSubmitLock';

export interface FacilityPenBoardProps {
  speciesProfile: SpeciesProfile;
  cages: CageLocation[];
  animals: Animal[];
  assignableAnimals: Animal[];
  boardModel: FacilityBoardModel;
  highlightedCageId?: string | null;
  onClearHighlightedCage?: () => void;
  onOpenAnimal: (animalId: string) => void;
  onSaveCage: (
    draft: Omit<CageLocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean | void> | void;
  onDeleteCage: (id: string) => void;
  onAssignAnimalToCage?: (animalId: string, nextCageLabel: string) => Promise<boolean | void> | void;
  onSaveTask: (
    draft: Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<boolean | void> | void;
  onPrintCageCardsForAnimals: (animals: Animal[], titleContext: string) => void;
  feedBatches?: FeedBatch[];
  onOpenFeedLedger?: () => void;
  fullScreen?: boolean;
  onCloseFullScreen?: () => void;
}

interface CageEditDraft {
  label: string;
  section: string;
  capacity: string;
  unitType: HousingUnitType | '';
  feedLotName: string;
  feedStockRemaining: string;
  feedStockUnit: string;
  feedLowThreshold: string;
  dailyRationNote: string;
  maintenanceTaskLabel: string;
  maintenanceIntervalDays: string;
  lastMaintenanceDateIso: string;
  notes: string;
}

function buildEditDraftFromCage(cage: CageLocation): CageEditDraft {
  return {
    label: cage.label,
    section: cage.section || '',
    capacity: String(Math.max(1, Number(cage.capacity) || 1)),
    unitType: cage.unitType || '',
    feedLotName: cage.feedLotName || '',
    feedStockRemaining:
      cage.feedStockRemaining && cage.feedStockRemaining > 0
        ? String(cage.feedStockRemaining)
        : '',
    feedStockUnit: cage.feedStockUnit || 'lbs',
    feedLowThreshold:
      cage.feedLowThreshold && cage.feedLowThreshold > 0 ? String(cage.feedLowThreshold) : '',
    dailyRationNote: cage.dailyRationNote || '',
    maintenanceTaskLabel: cage.maintenanceTaskLabel || '',
    maintenanceIntervalDays:
      cage.maintenanceIntervalDays && cage.maintenanceIntervalDays > 0
        ? String(cage.maintenanceIntervalDays)
        : '',
    lastMaintenanceDateIso: cage.lastMaintenanceDateIso || '',
    notes: cage.notes || '',
  };
}

function parseOptionalPosNum(raw: string): number | undefined {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
}

function parseOptionalPosInt(raw: string): number | undefined {
  const n = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(3650, Math.max(1, Math.round(n)));
}

export function FacilityPenBoard({
  speciesProfile,
  cages,
  animals,
  assignableAnimals,
  boardModel,
  highlightedCageId,
  onClearHighlightedCage,
  onOpenAnimal,
  onSaveCage,
  onDeleteCage,
  onAssignAnimalToCage,
  onSaveTask,
  onPrintCageCardsForAnimals,
  feedBatches = [],
  onOpenFeedLedger,
  fullScreen = false,
  onCloseFullScreen,
}: FacilityPenBoardProps) {
  const [filter, setFilter] = useState<FacilityBoardFilter>('all');
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>('all');
  const [editingCageId, setEditingCageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CageEditDraft | null>(null);
  const [scheduleNextTaskOnMaint, setScheduleNextTaskOnMaint] = useState(true);
  const [pendingCageAssignConfirm, setPendingCageAssignConfirm] = useState<{
    cageId: string;
    cageLabel: string;
    animalId: string;
    animalName: string;
    warning: CageAssignmentCapacityWarning;
  } | null>(null);

  const actionLock = useAsyncKeyedLock();
  const highlightScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    setFilter('all');
    setSelectedSectionKey('all');
    setEditingCageId(null);
    setEditDraft(null);
    setPendingCageAssignConfirm(null);
  }, [speciesProfile.name]);

  useEffect(() => {
    if (!highlightedCageId || highlightScrolledRef.current === highlightedCageId) return;
    const pen = boardModel.byCageId.get(highlightedCageId);
    if (!pen) return;
    highlightScrolledRef.current = highlightedCageId;
    setFilter('all');
    setSelectedSectionKey('all');
    const el = document.getElementById(`facility-pen-${highlightedCageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedCageId, boardModel.byCageId]);

  const visibleSections = useMemo(() => {
    return boardModel.sections
      .filter((sec) => selectedSectionKey === 'all' || sec.sectionKey === selectedSectionKey)
      .map((sec) => {
        const filteredPens = sec.pens.filter((pen) => matchesFacilityBoardFilter(pen, filter));
        return {
          ...sec,
          pens: filteredPens,
        };
      })
      .filter((sec) => sec.pens.length > 0);
  }, [boardModel.sections, selectedSectionKey, filter]);

  const allOccupiedAnimals = useMemo(() => {
    const seen = new Set<string>();
    const out: Animal[] = [];
    for (const sec of boardModel.sections) {
      for (const a of sec.occupantAnimals) {
        if (!seen.has(a.id)) {
          seen.add(a.id);
          out.push(a);
        }
      }
    }
    return out;
  }, [boardModel.sections]);

  const handleSaveEditedCage = async (cage: CageLocation) => {
    if (!editDraft || !editDraft.label.trim()) return;
    await actionLock.runKeyLocked(`edit:${cage.id}`, async () => {
      const feedStockRemaining = parseOptionalPosNum(editDraft.feedStockRemaining);
      const feedLowThreshold = parseOptionalPosNum(editDraft.feedLowThreshold);
      const maintenanceIntervalDays = parseOptionalPosInt(editDraft.maintenanceIntervalDays);
      const saved = await onSaveCage({
        id: cage.id,
        species: cage.species,
        label: editDraft.label.trim(),
        section: editDraft.section.trim(),
        capacity: Math.max(1, Math.round(Number(editDraft.capacity) || 1)),
        notes: editDraft.notes.trim(),
        unitType: editDraft.unitType || undefined,
        feedLotName: editDraft.feedLotName.trim() || undefined,
        feedStockRemaining,
        feedStockUnit: editDraft.feedLotName.trim() || feedStockRemaining
          ? editDraft.feedStockUnit.trim() || 'lbs'
          : undefined,
        feedLowThreshold,
        dailyRationNote: editDraft.dailyRationNote.trim() || undefined,
        maintenanceIntervalDays,
        maintenanceTaskLabel: editDraft.maintenanceTaskLabel.trim() || undefined,
        lastMaintenanceDateIso: editDraft.lastMaintenanceDateIso.trim() || undefined,
      });
      if (saved !== false) {
        setEditingCageId(null);
        setEditDraft(null);
        if (pendingCageAssignConfirm?.cageId === cage.id) {
          setPendingCageAssignConfirm(null);
        }
      }
    });
  };

  const handleQuickAssign = async (cage: CageLocation, animalId: string) => {
    if (!animalId || !onAssignAnimalToCage) return;
    const animal = assignableAnimals.find((a) => a.id === animalId);
    if (!animal) return;
    const warning = evaluateCageAssignmentCapacityWarning({
      targetCageLabel: cage.label,
      cages,
      animals,
      speciesName: speciesProfile.name,
      animalId: animal.id,
      animalName: animal.name,
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
    if (warning?.wouldExceed) {
      setPendingCageAssignConfirm({
        cageId: cage.id,
        cageLabel: cage.label,
        animalId: animal.id,
        animalName: animal.name,
        warning,
      });
      return;
    }
    setPendingCageAssignConfirm(null);
    await actionLock.runKeyLocked(`assign:${cage.id}`, async () => {
      await onAssignAnimalToCage(animal.id, cage.label);
    });
  };

  const handleConfirmOverCapacityAssign = async () => {
    if (!pendingCageAssignConfirm || !onAssignAnimalToCage) return;
    const { cageId, cageLabel: targetLabel, animalId } = pendingCageAssignConfirm;
    await actionLock.runKeyLocked(`assign:${cageId}`, async () => {
      await onAssignAnimalToCage(animalId, targetLabel);
      setPendingCageAssignConfirm(null);
    });
  };

  const handleUnassign = async (cageId: string, animalId: string) => {
    if (!onAssignAnimalToCage) return;
    if (pendingCageAssignConfirm?.cageId === cageId) {
      setPendingCageAssignConfirm(null);
    }
    await actionLock.runKeyLocked(`unassign:${animalId}`, async () => {
      await onAssignAnimalToCage(animalId, '');
    });
  };

  const handleLogMaintenanceDone = async (cage: CageLocation) => {
    const today = todayDateIso();
    await actionLock.runKeyLocked(`maint:${cage.id}`, async () => {
      const saved = await onSaveCage({
        ...cage,
        lastMaintenanceDateIso: today,
      });
      if (saved !== false && scheduleNextTaskOnMaint) {
        const nextTask = buildCageMaintenanceTaskDraft(cage, today);
        if (nextTask) {
          await onSaveTask(nextTask);
        }
      }
    });
  };

  const handleAdjustFeedStock = async (cage: CageLocation, delta: number) => {
    await actionLock.runKeyLocked(`feed:${cage.id}`, async () => {
      const current = Number(cage.feedStockRemaining) || 0;
      const nextVal = Math.max(0, Math.round((current + delta) * 100) / 100);
      await onSaveCage({
        ...cage,
        feedStockRemaining: nextVal > 0 ? nextVal : undefined,
      });
    });
  };

  const handleRegisterUnregisteredCage = async (label: string, animalCount: number) => {
    await actionLock.runKeyLocked(`register:${label.toLowerCase()}`, async () => {
      await onSaveCage({
        species: speciesProfile.name,
        label,
        section: '',
        capacity: Math.max(1, animalCount),
        notes: '',
      });
    });
  };

  const renderPenCard = (pen: FacilityPenCardModel) => {
    const { cage, occupancy, maintenance, feed, unitType, openLinkedTasks } = pen;
    const isHighlighted = highlightedCageId === cage.id;
    const isEditing = editingCageId === cage.id && editDraft !== null;
    const cageKey = normalizeCageLabelKey(cage.label);
    const candidateAnimals = assignableAnimals.filter(
      (a) => normalizeCageLabelKey(a.cageLocation) !== cageKey
    );
    const unassignedCandidates = candidateAnimals.filter((a) => !a.cageLocation.trim());
    const otherCageCandidates = candidateAnimals.filter((a) => Boolean(a.cageLocation.trim()));
    const pendingConfirm =
      pendingCageAssignConfirm?.cageId === cage.id ? pendingCageAssignConfirm : null;

    const accentBorder = occupancy.isOverCapacity
      ? 'border-l-[var(--barn-danger)]'
      : occupancy.isAtCapacity
        ? 'border-l-[var(--barn-terracotta)]'
        : occupancy.occupantCount > 0
          ? 'border-l-[var(--barn-sage)]'
          : 'border-l-[var(--barn-border)]';

    return (
      <article
        key={cage.id}
        id={`facility-pen-${cage.id}`}
        className={`rounded-xl border border-l-4 ${accentBorder} ${
          isHighlighted
            ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40 bg-[var(--barn-sage-tint)]/35'
            : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
        } p-3 space-y-2 text-xs transition-colors`}
      >
        {/* Top Row: Pen label, unit type, capacity, actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono font-semibold text-sm text-[var(--barn-ink)]">
                {cage.label}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[10px] font-medium text-[var(--barn-muted)]">
                {formatHousingUnitTypeLabel(unitType)}
              </span>
              <span
                className={`font-mono tabular-nums inline-flex items-center gap-1 ${
                  occupancy.isOverCapacity
                    ? 'font-semibold text-[var(--barn-danger)]'
                    : occupancy.isAtCapacity
                      ? 'font-semibold text-[var(--barn-terracotta)]'
                      : 'text-[var(--barn-muted)]'
                }`}
              >
                {occupancy.isOverCapacity && (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                )}
                {occupancy.ratioLabel}
              </span>
            </div>

            {isHighlighted && onClearHighlightedCage && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--barn-sage)] font-medium">
                <span>Opened via scanned pen link</span>
                <button
                  type="button"
                  onClick={onClearHighlightedCage}
                  className="underline hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {occupancy.occupants.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPrintCageCardsForAnimals(
                    occupancy.occupants,
                    `${cage.label} (${occupancy.occupants.length})`
                  )
                }
                aria-label={`Print QR cage cards for ${cage.label}`}
                title={`Print QR cage card${occupancy.occupants.length === 1 ? '' : 's'} for ${cage.label}`}
                className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  setEditingCageId(null);
                  setEditDraft(null);
                } else {
                  setEditingCageId(cage.id);
                  setEditDraft(buildEditDraftFromCage(cage));
                }
              }}
              aria-label={`Edit ${cage.label} pen details`}
              title="Edit pen, feedlot & maintenance"
              className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (editingCageId === cage.id) {
                  setEditingCageId(null);
                  setEditDraft(null);
                }
                if (pendingCageAssignConfirm?.cageId === cage.id) {
                  setPendingCageAssignConfirm(null);
                }
                onDeleteCage(cage.id);
              }}
              aria-label={`Remove location ${cage.label}`}
              title={`Remove ${cage.label}`}
              className="min-h-[32px] min-w-[32px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Occupant chips */}
        {occupancy.occupants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {occupancy.occupants.map((occ) => {
              const unassignBusy = actionLock.isKeyLocked(`unassign:${occ.id}`);
              return (
                <span
                  key={occ.id}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] px-2 py-0.5"
                >
                  <button
                    type="button"
                    onClick={() => onOpenAnimal(occ.id)}
                    className="font-medium hover:text-[var(--barn-sage)] hover:underline text-left"
                  >
                    {occ.name}
                    {occ.tattoo ? (
                      <span className="font-mono text-[10.5px] text-[var(--barn-muted)] ml-1">
                        ({occ.tattoo})
                      </span>
                    ) : null}
                  </button>
                  {onAssignAnimalToCage && (
                    <button
                      type="button"
                      disabled={unassignBusy}
                      onClick={() => void handleUnassign(cage.id, occ.id)}
                      aria-label={`Remove ${occ.name} from ${cage.label}`}
                      title={`Remove ${occ.name} from ${cage.label}`}
                      className="min-h-[20px] min-w-[20px] rounded text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center disabled:opacity-45"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--barn-muted)] italic">Open / Unassigned</div>
        )}

        {/* Feedlot Inventory Link */}
        {feed.hasFeedLink && (
          <div
            className={`rounded-lg border px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              feed.isLowStock
                ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/60'
                : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-[var(--barn-ink)]">
                <Package className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span className="truncate">{feed.feedLotName || 'Linked Feed'}</span>
                {feed.isLowStock && (
                  <span className="font-semibold text-[var(--barn-danger)] shrink-0">
                    {feed.isDepleted ? 'Out of stock' : 'Low stock'}
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[var(--barn-muted)] flex flex-wrap gap-x-2">
                {(feed.stockRemaining > 0 || feed.lowThreshold > 0) && (
                  <span className="font-mono tabular-nums">{feed.stockSummaryLabel}</span>
                )}
                {feed.dailyRationNote && <span>Ration: {feed.dailyRationNote}</span>}
              </div>
            </div>
            {(feed.stockRemaining > 0 || feed.lowThreshold > 0) && (
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={actionLock.isKeyLocked(`feed:${cage.id}`) || feed.stockRemaining <= 0}
                  onClick={() => void handleAdjustFeedStock(cage, -1)}
                  aria-label={`Decrease feed stock for ${cage.label}`}
                  className="min-h-[26px] min-w-[26px] rounded border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-mono font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-40"
                >
                  −1
                </button>
                <button
                  type="button"
                  disabled={actionLock.isKeyLocked(`feed:${cage.id}`)}
                  onClick={() => void handleAdjustFeedStock(cage, 1)}
                  aria-label={`Increase feed stock for ${cage.label}`}
                  className="min-h-[26px] min-w-[26px] rounded border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-mono font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-40"
                >
                  +1
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recurring Maintenance Schedule */}
        {maintenance.hasSchedule && (
          <div
            className={`rounded-lg border px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              maintenance.state === 'overdue'
                ? 'border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)]/75'
                : maintenance.state === 'due_today' || maintenance.state === 'unlogged'
                  ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/45'
                  : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
            }`}
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-[var(--barn-ink)]">
                <Wrench className="w-3.5 h-3.5 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                <span className="truncate">{maintenance.taskLabel}</span>
              </div>
              <div
                className={`text-[10.5px] font-mono tabular-nums ${
                  maintenance.state === 'overdue'
                    ? 'text-[var(--barn-danger)] font-semibold'
                    : maintenance.needsAttention
                      ? 'text-[var(--barn-terracotta)] font-semibold'
                      : 'text-[var(--barn-muted)]'
                }`}
              >
                {maintenance.statusText}
              </div>
            </div>
            <button
              type="button"
              disabled={actionLock.isKeyLocked(`maint:${cage.id}`)}
              onClick={() => void handleLogMaintenanceDone(cage)}
              className="min-h-[28px] px-2.5 py-1 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1 hover:opacity-95 disabled:opacity-55 shrink-0"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Log Done
            </button>
          </div>
        )}

        {/* Open Linked Tasks Summary */}
        {openLinkedTasks.length > 0 && (
          <div className="text-[11px] text-[var(--barn-muted)] flex items-center gap-1.5">
            <span className="font-mono font-semibold text-[var(--barn-ink)]">
              {openLinkedTasks.length} open task{openLinkedTasks.length === 1 ? '' : 's'}:
            </span>
            <span className="truncate">{openLinkedTasks[0].title}</span>
          </div>
        )}

        {/* Inline Pen / Feedlot / Maintenance Editor */}
        {isEditing && editDraft && (
          <div className="p-2.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Label *</span>
                <input
                  type="text"
                  value={editDraft.label}
                  onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                  placeholder="Hutch R-09"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Barn Section / Row</span>
                <input
                  type="text"
                  value={editDraft.section}
                  onChange={(e) => setEditDraft({ ...editDraft, section: e.target.value })}
                  placeholder="Row A / North Pasture"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Housing Type</span>
                <select
                  value={editDraft.unitType}
                  onChange={(e) =>
                    setEditDraft({
                      ...editDraft,
                      unitType: e.target.value as HousingUnitType | '',
                    })
                  }
                  className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="">Auto-detect</option>
                  {HOUSING_UNIT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="text-[10.5px] text-[var(--barn-muted)]">Capacity</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={editDraft.capacity}
                  onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })}
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </label>
            </div>

            <div className="pt-1.5 border-t border-[var(--barn-border)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
                Feedlot Inventory Link (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="min-w-0">
                  <input
                    type="text"
                    aria-label="Feed lot or bin name"
                    list={
                      feedBatches.length > 0 ? `facility-feed-lot-list-${cage.id}` : undefined
                    }
                    value={editDraft.feedLotName}
                    onChange={(e) => setEditDraft({ ...editDraft, feedLotName: e.target.value })}
                    placeholder="Feed lot (e.g. 18% Show Pellet - Bin A)"
                    className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                  />
                  {feedBatches.length > 0 && (
                    <datalist id={`facility-feed-lot-list-${cage.id}`}>
                      {feedBatches.map((b) => {
                        const lotLabel = b.lotNumber
                          ? `${[b.brand, b.productName].filter(Boolean).join(' ')} (Lot ${b.lotNumber})`
                          : [b.brand, b.productName].filter(Boolean).join(' ');
                        return lotLabel ? <option key={b.id} value={lotLabel} /> : null;
                      })}
                    </datalist>
                  )}
                </div>
                <input
                  type="text"
                  aria-label="Daily ration note"
                  value={editDraft.dailyRationNote}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, dailyRationNote: e.target.value })
                  }
                  placeholder="Daily ration (e.g. 6 oz/day)"
                  className="w-full min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  aria-label="Remaining feed stock"
                  value={editDraft.feedStockRemaining}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, feedStockRemaining: e.target.value })
                  }
                  placeholder="Stock qty"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
                <input
                  type="text"
                  aria-label="Feed stock unit"
                  value={editDraft.feedStockUnit}
                  onChange={(e) => setEditDraft({ ...editDraft, feedStockUnit: e.target.value })}
                  placeholder="Unit (lbs/bags)"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  aria-label="Low stock alert threshold"
                  value={editDraft.feedLowThreshold}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, feedLowThreshold: e.target.value })
                  }
                  placeholder="Low alert ≤"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="pt-1.5 border-t border-[var(--barn-border)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
                Recurring Maintenance Schedule (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  aria-label="Maintenance task label"
                  value={editDraft.maintenanceTaskLabel}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, maintenanceTaskLabel: e.target.value })
                  }
                  placeholder="Sanitize tray & waterer"
                  className="sm:col-span-2 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
                <input
                  type="number"
                  min={0}
                  max={365}
                  aria-label="Maintenance interval in days"
                  value={editDraft.maintenanceIntervalDays}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, maintenanceIntervalDays: e.target.value })
                  }
                  placeholder="Every N days"
                  className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-[var(--barn-muted)]">
                <span>Last done:</span>
                <input
                  type="date"
                  value={editDraft.lastMaintenanceDateIso}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, lastMaintenanceDateIso: e.target.value })
                  }
                  className="min-h-[32px] px-2 py-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-ink)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`edit:${cage.id}`)}
                onClick={() => {
                  setEditingCageId(null);
                  setEditDraft(null);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`edit:${cage.id}`) || !editDraft.label.trim()}
                onClick={() => void handleSaveEditedCage(cage)}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-55"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                {actionLock.isKeyLocked(`edit:${cage.id}`) ? 'Saving...' : 'Save Pen'}
              </button>
            </div>
          </div>
        )}

        {/* Quick Occupant Assignment Dropdown */}
        {onAssignAnimalToCage && candidateAnimals.length > 0 && (
          <div className="relative">
            <UserPlus
              className="w-3.5 h-3.5 text-[var(--barn-muted)] pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <select
              value=""
              disabled={actionLock.isKeyLocked(`assign:${cage.id}`)}
              aria-label={`Assign animal to ${cage.label}`}
              onChange={(e) => {
                const picked = e.target.value;
                if (picked) {
                  void handleQuickAssign(cage, picked);
                }
              }}
              className="w-full min-h-[32px] pl-8 pr-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-ink)] disabled:opacity-55"
            >
              <option value="">
                {actionLock.isKeyLocked(`assign:${cage.id}`)
                  ? 'Assigning...'
                  : `+ Assign ${speciesProfile.name} to ${cage.label}...`}
              </option>
              {unassignedCandidates.length > 0 && (
                <optgroup label="Unassigned">
                  {unassignedCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.tattoo ? ` (${a.tattoo})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherCageCandidates.length > 0 && (
                <optgroup label="Move from another pen">
                  {otherCageCandidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.tattoo ? ` (${a.tattoo})` : ''} · in {a.cageLocation}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        {/* IMP-028 Soft Over-Capacity Confirmation */}
        {pendingConfirm && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)] px-2.5 py-2 space-y-1.5 text-[11px]"
          >
            <div className="font-semibold text-[var(--barn-danger)] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{pendingConfirm.warning.headline}</span>
            </div>
            <p className="text-[var(--barn-ink)]">{pendingConfirm.warning.detail}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={actionLock.isKeyLocked(`assign:${cage.id}`)}
                onClick={() => void handleConfirmOverCapacityAssign()}
                className="min-h-[28px] px-2.5 py-1 rounded-md bg-[var(--barn-danger)] text-white font-semibold disabled:opacity-55"
              >
                Assign Anyway
              </button>
              <button
                type="button"
                onClick={() => setPendingCageAssignConfirm(null)}
                className="min-h-[28px] px-2.5 py-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const boardContent = (
    <div className="space-y-3">
      {/* Compact KPI / Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div
          role="group"
          aria-label="Filter pens on Facility Board"
          className="flex flex-wrap items-center gap-1"
        >
          {(
            [
              { id: 'all', label: 'All', count: boardModel.totals.totalPens, warn: false },
              {
                id: 'over_capacity',
                label: 'Over Cap',
                count: boardModel.totals.overCapacityPens,
                warn: boardModel.totals.overCapacityPens > 0,
              },
              {
                id: 'maintenance_due',
                label: 'Maint Due',
                count: boardModel.totals.maintenanceDueOrOverdue,
                warn: boardModel.totals.maintenanceDueOrOverdue > 0,
              },
              {
                id: 'low_feed',
                label: 'Low Feed',
                count: boardModel.totals.lowFeedPens,
                warn: boardModel.totals.lowFeedPens > 0,
              },
              { id: 'open', label: 'Open Spots', count: boardModel.totals.emptyPens, warn: false },
            ] as const
          ).map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                  active
                    ? 'bg-[var(--barn-sage)] border-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                    : item.warn
                      ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/55 text-[var(--barn-ink)]'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                <span>{item.label}</span>
                <span className="font-mono tabular-nums opacity-85">({item.count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {boardModel.sections.length > 1 && (
            <select
              aria-label="Filter by barn section"
              value={selectedSectionKey}
              onChange={(e) => setSelectedSectionKey(e.target.value)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            >
              <option value="all">All Sections ({boardModel.sections.length})</option>
              {boardModel.sections.map((sec) => (
                <option key={sec.sectionKey} value={sec.sectionKey}>
                  {sec.sectionName} ({sec.totalPens})
                </option>
              ))}
            </select>
          )}

          {allOccupiedAnimals.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onPrintCageCardsForAnimals(
                  allOccupiedAnimals,
                  `${speciesProfile.name} Facility (${allOccupiedAnimals.length})`
                )
              }
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              Print All QR Cards
            </button>
          )}
        </div>
      </div>

      {/* Auto-schedule next reminder toggle when any pen has recurring maintenance */}
      {boardModel.allPens.some((p) => p.maintenance.hasSchedule) && (
        <label className="inline-flex items-center gap-2 text-[11px] text-[var(--barn-muted)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={scheduleNextTaskOnMaint}
            onChange={(e) => setScheduleNextTaskOnMaint(e.target.checked)}
            className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
          />
          <span>
            When logging maintenance done, automatically schedule the next reminder in Master Task List
          </span>
        </label>
      )}

      {/* Feedlot Inventory Rollup Strip */}
      {boardModel.feedLots.length > 0 && (
        <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[var(--barn-ink)]">
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
              <span>Linked Feedlot Inventories ({boardModel.feedLots.length})</span>
            </div>
            {onOpenFeedLedger && (
              <button
                type="button"
                onClick={onOpenFeedLedger}
                className="text-[11px] font-semibold text-[var(--barn-sage)] hover:underline"
              >
                Open Feed Ledger
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {boardModel.feedLots.map((lot) => (
              <div
                key={lot.lotKey}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] space-y-0.5 ${
                  lot.hasLowStock
                    ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)]/55'
                    : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
                }`}
              >
                <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                  <span>{lot.feedLotName}</span>
                  {lot.hasLowStock && (
                    <span className="text-[10px] font-mono text-[var(--barn-danger)]">
                      LOW ({lot.lowStockPenCount})
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] font-mono tabular-nums text-[var(--barn-muted)]">
                  {lot.penCount} pen{lot.penCount === 1 ? '' : 's'} · {lot.animalCount} head
                  {lot.totalStockRemaining > 0
                    ? ` · ${lot.totalStockRemaining} ${lot.stockUnit}`
                    : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unregistered Housing Labels & Unassigned Stock Bar */}
      {(boardModel.unregisteredCages.length > 0 || boardModel.totals.unassignedCount > 0) && (
        <div className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] px-3 py-2 space-y-1.5 text-[11px]">
          {boardModel.unregisteredCages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[var(--barn-ink)]">
                Unregistered pen labels on animals:
              </span>
              {boardModel.unregisteredCages.map((u) => (
                <button
                  key={u.labelKey}
                  type="button"
                  disabled={actionLock.isKeyLocked(`register:${u.labelKey}`)}
                  onClick={() => void handleRegisterUnregisteredCage(u.label, u.animals.length)}
                  className="min-h-[26px] px-2 py-0.5 rounded-md border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] font-medium inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  <span className="font-mono">{u.label}</span>
                  <span className="text-[var(--barn-muted)]">({u.animals.length})</span>
                </button>
              ))}
            </div>
          )}
          {boardModel.totals.unassignedCount > 0 && (
            <div className="text-[var(--barn-muted)]">
              <span className="font-mono font-semibold text-[var(--barn-ink)]">
                {boardModel.totals.unassignedCount}
              </span>{' '}
              active {speciesProfile.name.toLowerCase()} record
              {boardModel.totals.unassignedCount === 1 ? ' has' : 's have'} no cage/pen assigned yet
              — use any pen&apos;s <strong className="text-[var(--barn-ink)]">+ Assign</strong> menu
              below.
            </div>
          )}
        </div>
      )}

      {/* Visual Section-Grouped Hutch / Pen Board */}
      {boardModel.totals.totalPens === 0 ? (
        <p className="text-sm text-[var(--barn-muted)]">
          No cages, hutches, or pastures added yet. Use <strong>Add Location</strong> to start your
          visual facility board.
        </p>
      ) : visibleSections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-4 text-center text-xs text-[var(--barn-muted)] space-y-1">
          <div>No pens match the active board filter.</div>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSelectedSectionKey('all');
            }}
            className="text-[var(--barn-sage)] font-semibold underline"
          >
            Reset board filters
          </button>
        </div>
      ) : (
        <div
          className={`space-y-4 ${
            fullScreen ? '' : 'max-h-[34rem] overflow-y-auto pr-1'
          }`}
        >
          {visibleSections.map((sec) => (
            <section
              key={sec.sectionKey}
              aria-label={`Barn section ${sec.sectionName}`}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[var(--barn-border)]">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--barn-ink)]">
                    {sec.sectionName}
                  </h3>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                    {sec.occupiedPens}/{sec.totalPens} occupied · {sec.totalOccupants}/
                    {sec.totalCapacity} head
                  </span>
                  {sec.overCapacityCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--barn-danger)]">
                      · {sec.overCapacityCount} over cap
                    </span>
                  )}
                  {sec.maintenanceAttentionCount > 0 && (
                    <span className="text-[11px] font-semibold text-[var(--barn-terracotta)]">
                      · {sec.maintenanceAttentionCount} maint due
                    </span>
                  )}
                </div>
                {sec.occupantAnimals.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onPrintCageCardsForAnimals(
                        sec.occupantAnimals,
                        `${sec.sectionName} (${sec.occupantAnimals.length})`
                      )
                    }
                    className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <QrCode className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                    Print Row QR Cards ({sec.occupantAnimals.length})
                  </button>
                )}
              </div>

              <div
                className={
                  fullScreen
                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
                    : 'grid grid-cols-1 sm:grid-cols-2 gap-2.5'
                }
              >
                {sec.pens.map(renderPenCard)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  if (!fullScreen) {
    return boardContent;
  }

  return (
    <FullScreenFacilityBoardShell
      title={`${speciesProfile.name} Facility Pen & Hutch-Row Board`}
      subtitle={`${boardModel.totals.totalPens} pens across ${boardModel.sections.length} section${
        boardModel.sections.length === 1 ? '' : 's'
      } · ${boardModel.totals.totalOccupants}/${boardModel.totals.totalCapacity} total occupancy`}
      onClose={onCloseFullScreen ?? (() => {})}
    >
      {boardContent}
    </FullScreenFacilityBoardShell>
  );
}

function FullScreenFacilityBoardShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-6xl h-[92dvh] max-h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="px-4 sm:px-6 py-3.5 border-b border-[var(--barn-border)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-semibold truncate">{title}</h2>
            <p className="text-xs text-[var(--barn-muted)] font-mono tabular-nums mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close full-screen facility board"
            className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
```

## `src/components/FeedLedgerScreen.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Feed Inventory Ledger, Pre-Compression Tag Lot-Number OCR & Biosecurity Auto-Purge
 * (`src/components/FeedLedgerScreen.tsx`).
 *
 * Features:
 * - Strictly species-isolated Feed Batch purchases & Intake Allocations linked to
 *   Cages/Pens, Active Litters, Animals, or General Barn.
 * - Pre-compression client-side OCR (`captureFeedTagWithPreCompressionOcr`) on feed tag
 *   photos to index mill lot numbers, mill codes, net weights, crude protein %, and brands,
 *   with clickable candidate chips and full manual override for faded mill stamps.
 * - Biosecurity Auto-Purge policy (30 / 60 / 90 days or Manual Only) that reclaims heavy
 *   tag photo storage once a lot number is indexed while preserving all lot metadata.
 * - Offline Manufacturer Emergency Directory & Lot Traceability lookup across pens/litters.
 */

import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Flag,
  Image as ImageIcon,
  Package,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  evaluateFeedInventorySummary,
  formatFeedLedgerCsv,
  isFeedBatchLowStock,
  traceFeedLotToCagesAndLitters,
} from '../core/feedInventory';
import {
  FEED_MANUFACTURER_DIRECTORY,
  FeedDirectoryCategory,
  filterFeedManufacturerDirectory,
  matchManufacturerForBrand,
} from '../core/feedManufacturerDirectory';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import {
  BarnDatabaseSnapshot,
  BarnSettings,
  FEED_PURGE_WINDOW_OPTIONS,
  FeedAllocation,
  FeedAllocationTargetType,
  FeedBatch,
  FeedPurgeWindowDays,
  formatCurrencyCents,
  formatReadableDate,
  normalizeFeedPurgeWindowDays,
  todayDateIso,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import {
  captureFeedTagWithPreCompressionOcr,
  FeedTagCaptureResult,
} from '../storage/feedTagOcr';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { copyTextWithFallback, downloadTextFile } from '../utils/webFileActions';

export interface FeedLedgerScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onOpenAnimal: (animalId: string) => void;
  onSaveFeedBatch: (
    draft: Omit<FeedBatch, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<boolean>;
  onDeleteFeedBatch: (id: string) => Promise<void> | void;
  onLogFeedAllocation: (
    draft: Omit<FeedAllocation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    options?: { syncLinkedCageFeed?: boolean }
  ) => Promise<boolean>;
  onDeleteFeedAllocation: (id: string) => Promise<void> | void;
  onRunBiosecurityPurge: (options?: {
    windowDays?: FeedPurgeWindowDays;
    silent?: boolean;
  }) => Promise<{ purgedCount: number; reclaimedBytes: number }>;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
}

type FeedLedgerTab = 'inventory' | 'allocations' | 'biosecurity';
type BatchFilter = 'all' | 'active' | 'low_stock' | 'recalled' | 'has_photo';

interface BatchFormDraft {
  id?: string;
  brand: string;
  productName: string;
  lotNumber: string;
  millCode: string;
  manufactureDateIso: string;
  purchaseDateIso: string;
  bagCount: string;
  bagWeightValue: string;
  bagWeightUnit: string;
  totalQuantity: string;
  totalManuallyEdited: boolean;
  remainingQuantity: string;
  remainingManuallyEdited: boolean;
  lowStockThreshold: string;
  totalCost: string;
  supplierName: string;
  proteinPercent: string;
  notes: string;
  tagPhotoDataUrl?: string;
  tagPhotoThumbnailDataUrl?: string;
  tagPhotoMimeType?: string;
  tagPhotoBytes?: number;
  tagPhotoCapturedDateIso?: string;
  tagPhotoPurgedAtIso?: string;
  tagPhotoBytesReclaimed?: number;
  ocrRawText?: string;
  ocrConfidence?: number;
  ocrManualOverride: boolean;
  recallFlagged: boolean;
  recallNote: string;
}

function makeEmptyBatchDraft(): BatchFormDraft {
  return {
    brand: '',
    productName: '',
    lotNumber: '',
    millCode: '',
    manufactureDateIso: '',
    purchaseDateIso: todayDateIso(),
    bagCount: '1',
    bagWeightValue: '50',
    bagWeightUnit: 'lbs',
    totalQuantity: '50',
    totalManuallyEdited: false,
    remainingQuantity: '50',
    remainingManuallyEdited: false,
    lowStockThreshold: '25',
    totalCost: '',
    supplierName: '',
    proteinPercent: '',
    notes: '',
    ocrManualOverride: false,
    recallFlagged: false,
    recallNote: '',
  };
}

function batchToFormDraft(batch: FeedBatch): BatchFormDraft {
  return {
    id: batch.id,
    brand: batch.brand,
    productName: batch.productName,
    lotNumber: batch.lotNumber,
    millCode: batch.millCode,
    manufactureDateIso: batch.manufactureDateIso,
    purchaseDateIso: batch.purchaseDateIso,
    bagCount: String(batch.bagCount || 0),
    bagWeightValue: String(batch.bagWeightValue || 0),
    bagWeightUnit: batch.bagWeightUnit || 'lbs',
    totalQuantity: String(batch.totalQuantity || 0),
    totalManuallyEdited: true,
    remainingQuantity: String(batch.remainingQuantity || 0),
    remainingManuallyEdited: true,
    lowStockThreshold: batch.lowStockThreshold > 0 ? String(batch.lowStockThreshold) : '',
    totalCost:
      typeof batch.totalCostCents === 'number' && batch.totalCostCents > 0
        ? (batch.totalCostCents / 100).toFixed(2)
        : '',
    supplierName: batch.supplierName,
    proteinPercent:
      typeof batch.proteinPercent === 'number' && batch.proteinPercent > 0
        ? String(batch.proteinPercent)
        : '',
    notes: batch.notes,
    tagPhotoDataUrl: batch.tagPhotoDataUrl,
    tagPhotoThumbnailDataUrl: batch.tagPhotoThumbnailDataUrl,
    tagPhotoMimeType: batch.tagPhotoMimeType,
    tagPhotoBytes: batch.tagPhotoBytes,
    tagPhotoCapturedDateIso: batch.tagPhotoCapturedDateIso,
    tagPhotoPurgedAtIso: batch.tagPhotoPurgedAtIso,
    tagPhotoBytesReclaimed: batch.tagPhotoBytesReclaimed,
    ocrRawText: batch.ocrRawText,
    ocrConfidence: batch.ocrConfidence,
    ocrManualOverride: Boolean(batch.ocrManualOverride),
    recallFlagged: Boolean(batch.recallFlagged),
    recallNote: batch.recallNote || '',
  };
}

export function FeedLedgerScreen({
  activeData,
  settings,
  onBackToHub,
  onOpenAnimal,
  onSaveFeedBatch,
  onDeleteFeedBatch,
  onLogFeedAllocation,
  onDeleteFeedAllocation,
  onRunBiosecurityPurge,
  onUpdateSettings,
}: FeedLedgerScreenProps) {
  const { speciesProfile, feedBatches, feedAllocations, cages, breedings, activeAnimals } =
    activeData;
  const purgeWindowDays = normalizeFeedPurgeWindowDays(settings.feedTagPurgeWindowDays);

  const [activeTab, setActiveTab] = useState<FeedLedgerTab>('inventory');
  const [batchSearch, setBatchSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('all');

  // Batch Editor + OCR Modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDraft, setBatchDraft] = useState<BatchFormDraft>(makeEmptyBatchDraft);
  const [ocrProgress, setOcrProgress] = useState<{
    busy: boolean;
    stage: string;
    pct: number;
  }>({ busy: false, stage: '', pct: 0 });
  const [ocrResult, setOcrResult] = useState<FeedTagCaptureResult | null>(null);
  const [showRawOcrText, setShowRawOcrText] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Photo Lightbox state
  const [lightboxBatch, setLightboxBatch] = useState<FeedBatch | null>(null);

  // Inline delete & recall confirm state
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);
  const [confirmDeleteAllocId, setConfirmDeleteAllocId] = useState<string | null>(null);
  const [recallEditBatchId, setRecallEditBatchId] = useState<string | null>(null);
  const [recallNoteDraft, setRecallNoteDraft] = useState('');

  // Allocation Form state
  const [allocBatchId, setAllocBatchId] = useState('');
  const [allocTargetType, setAllocTargetType] = useState<FeedAllocationTargetType>('cage');
  const [allocTargetId, setAllocTargetId] = useState('');
  const [allocCustomLabel, setAllocCustomLabel] = useState('General Barn');
  const [allocQty, setAllocQty] = useState('');
  const [allocUnit, setAllocUnit] = useState('lbs');
  const [allocDateIso, setAllocDateIso] = useState(todayDateIso());
  const [allocNotes, setAllocNotes] = useState('');
  const [syncLinkedCageFeed, setSyncLinkedCageFeed] = useState(true);
  const [allocFeedback, setAllocFeedback] = useState<string | null>(null);

  // Biosecurity / Lot Tracing / Manufacturer Directory state
  const [lotTraceQuery, setLotTraceQuery] = useState('');
  const [dirSearch, setDirSearch] = useState('');
  const [dirCategory, setDirCategory] = useState<FeedDirectoryCategory | 'all'>('all');
  const [dirSpeciesOnly, setDirSpeciesOnly] = useState(true);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchBrandInputRef = useRef<HTMLInputElement | null>(null);

  const batchSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const allocSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const purgeSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const rowActionLock = useAsyncKeyedLock();

  const batchDialogRef = useAccessibleDialog({
    isOpen: batchModalOpen,
    onClose: () => {
      if (!batchSubmitLock.isSubmitting && !ocrProgress.busy) {
        setBatchModalOpen(false);
      }
    },
    initialFocusRef: batchBrandInputRef,
  });

  const lightboxDialogRef = useAccessibleDialog({
    isOpen: lightboxBatch !== null,
    onClose: () => setLightboxBatch(null),
  });

  // Reset species-scoped selections cleanly if active species switches
  useEffect(() => {
    setBatchSearch('');
    setBatchFilter('all');
    setBatchModalOpen(false);
    setLightboxBatch(null);
    setConfirmDeleteBatchId(null);
    setConfirmDeleteAllocId(null);
    setRecallEditBatchId(null);
    setAllocBatchId('');
    setAllocTargetId('');
    setLotTraceQuery('');
  }, [speciesProfile.name]);

  // Keep allocation target defaults aligned with available species batches & targets
  useEffect(() => {
    if (!allocBatchId || !feedBatches.some((b) => b.id === allocBatchId)) {
      const preferred =
        feedBatches.find((b) => b.remainingQuantity > 0) || feedBatches[0] || null;
      if (preferred) {
        setAllocBatchId(preferred.id);
        setAllocUnit(preferred.bagWeightUnit || 'lbs');
      } else {
        setAllocBatchId('');
      }
    }
  }, [feedBatches, allocBatchId]);

  useEffect(() => {
    if (allocTargetType === 'cage') {
      if (!cages.some((c) => c.id === allocTargetId)) {
        setAllocTargetId(cages[0]?.id || '');
      }
    } else if (allocTargetType === 'litter') {
      if (!breedings.some((b) => b.id === allocTargetId)) {
        setAllocTargetId(breedings[0]?.id || '');
      }
    } else if (allocTargetType === 'animal') {
      if (!activeAnimals.some((a) => a.id === allocTargetId)) {
        setAllocTargetId(activeAnimals[0]?.id || '');
      }
    } else {
      setAllocTargetId('');
    }
  }, [allocTargetType, cages, breedings, activeAnimals, allocTargetId]);

  const summary = useMemo(
    () =>
      evaluateFeedInventorySummary({
        batches: feedBatches,
        allocations: feedAllocations,
        speciesName: speciesProfile.name,
        purgeWindowDays,
      }),
    [feedBatches, feedAllocations, speciesProfile.name, purgeWindowDays]
  );

  const batchById = useMemo(
    () => new Map(feedBatches.map((b) => [b.id, b])),
    [feedBatches]
  );

  const allocationCountByBatchId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const al of feedAllocations) {
      counts.set(al.feedBatchId, (counts.get(al.feedBatchId) || 0) + 1);
    }
    return counts;
  }, [feedAllocations]);

  const filteredBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    return feedBatches.filter((batch) => {
      if (batchFilter === 'active' && batch.remainingQuantity <= 0) return false;
      if (batchFilter === 'low_stock' && !isFeedBatchLowStock(batch)) return false;
      if (batchFilter === 'recalled' && !batch.recallFlagged) return false;
      if (
        batchFilter === 'has_photo' &&
        !batch.tagPhotoDataUrl &&
        !batch.tagPhotoThumbnailDataUrl
      ) {
        return false;
      }
      if (!q) return true;
      return [
        batch.brand,
        batch.productName,
        batch.lotNumber,
        batch.millCode,
        batch.supplierName,
        batch.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [feedBatches, batchFilter, batchSearch]);

  const lotTraces = useMemo(
    () =>
      traceFeedLotToCagesAndLitters({
        lotQuery: lotTraceQuery,
        batches: feedBatches,
        allocations: feedAllocations,
        cages,
        breedings,
        animals: activeData.animals,
      }),
    [lotTraceQuery, feedBatches, feedAllocations, cages, breedings, activeData.animals]
  );

  const directoryMatches = useMemo(
    () =>
      filterFeedManufacturerDirectory({
        query: dirSearch,
        speciesName: dirSpeciesOnly ? speciesProfile.name : 'all',
        category: dirCategory,
      }),
    [dirSearch, dirSpeciesOnly, speciesProfile.name, dirCategory]
  );

  const matchedManufacturerHint = useMemo(
    () => matchManufacturerForBrand(batchDraft.brand),
    [batchDraft.brand]
  );

  const distinctIndexedLots = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ lotNumber: string; recallFlagged: boolean }> = [];
    for (const b of feedBatches) {
      const lot = b.lotNumber.trim();
      if (!lot) continue;
      const key = lot.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lotNumber: lot, recallFlagged: Boolean(b.recallFlagged) });
    }
    return out;
  }, [feedBatches]);

  const openNewBatchModal = () => {
    setBatchDraft(makeEmptyBatchDraft());
    setOcrResult(null);
    setOcrProgress({ busy: false, stage: '', pct: 0 });
    setShowRawOcrText(false);
    setModalError(null);
    setBatchModalOpen(true);
  };

  const openEditBatchModal = (batch: FeedBatch) => {
    setBatchDraft(batchToFormDraft(batch));
    setOcrResult(null);
    setOcrProgress({ busy: false, stage: '', pct: 0 });
    setShowRawOcrText(false);
    setModalError(null);
    setBatchModalOpen(true);
  };

  const updateBagMath = (
    patch: Partial<Pick<BatchFormDraft, 'bagCount' | 'bagWeightValue' | 'bagWeightUnit'>>
  ) => {
    setBatchDraft((prev) => {
      const nextCountStr = patch.bagCount ?? prev.bagCount;
      const nextWeightStr = patch.bagWeightValue ?? prev.bagWeightValue;
      const nextUnit = patch.bagWeightUnit ?? prev.bagWeightUnit;
      const c = Math.max(0, Number(nextCountStr) || 0);
      const w = Math.max(0, Number(nextWeightStr) || 0);
      const computed = c > 0 && w > 0 ? String(Math.round(c * w * 100) / 100) : prev.totalQuantity;
      return {
        ...prev,
        ...patch,
        bagWeightUnit: nextUnit,
        totalQuantity: prev.totalManuallyEdited ? prev.totalQuantity : computed,
        remainingQuantity: prev.remainingManuallyEdited ? prev.remainingQuantity : computed,
      };
    });
  };

  const handleTagPhotoSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setModalError(null);
    setOcrProgress({ busy: true, stage: 'Preparing full-resolution tag scan...', pct: 5 });

    try {
      const capture = await captureFeedTagWithPreCompressionOcr(file, (stage, pct) => {
        setOcrProgress({ busy: true, stage, pct: pct ?? 35 });
      });
      setOcrResult(capture);
      setBatchDraft((prev) => {
        const nextBagWeight = capture.parsed.detectedBagWeight
          ? String(capture.parsed.detectedBagWeight.value)
          : prev.bagWeightValue;
        const nextUnit = capture.parsed.detectedBagWeight
          ? capture.parsed.detectedBagWeight.unit
          : prev.bagWeightUnit;
        const bagCountNum = Math.max(0, Number(prev.bagCount) || 1);
        const weightNum = Math.max(0, Number(nextBagWeight) || 0);
        const computedQty =
          bagCountNum > 0 && weightNum > 0
            ? String(Math.round(bagCountNum * weightNum * 100) / 100)
            : prev.totalQuantity;

        return {
          ...prev,
          tagPhotoDataUrl: capture.optimizedImage.dataUrl,
          tagPhotoThumbnailDataUrl: capture.optimizedImage.thumbnailDataUrl,
          tagPhotoMimeType: capture.optimizedImage.mimeType,
          tagPhotoBytes: capture.optimizedImage.storedBytes,
          tagPhotoCapturedDateIso: capture.capturedDateIso,
          tagPhotoPurgedAtIso: undefined,
          ocrRawText: capture.rawText,
          ocrConfidence: capture.confidence,
          lotNumber: prev.ocrManualOverride
            ? prev.lotNumber
            : capture.parsed.bestLotNumber || prev.lotNumber,
          millCode: prev.millCode || capture.parsed.millCode,
          manufactureDateIso: prev.manufactureDateIso || capture.parsed.manufactureDateIso,
          brand: prev.brand || capture.parsed.detectedBrand,
          bagWeightValue:
            !prev.id && capture.parsed.detectedBagWeight ? nextBagWeight : prev.bagWeightValue,
          bagWeightUnit:
            !prev.id && capture.parsed.detectedBagWeight ? nextUnit : prev.bagWeightUnit,
          totalQuantity:
            !prev.id && !prev.totalManuallyEdited && capture.parsed.detectedBagWeight
              ? computedQty
              : prev.totalQuantity,
          remainingQuantity:
            !prev.id && !prev.remainingManuallyEdited && capture.parsed.detectedBagWeight
              ? computedQty
              : prev.remainingQuantity,
          proteinPercent:
            prev.proteinPercent ||
            (capture.parsed.detectedProteinPercent
              ? String(capture.parsed.detectedProteinPercent)
              : ''),
        };
      });
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : 'Could not read that tag image. Choose a JPG or PNG photo.'
      );
    } finally {
      setOcrProgress({ busy: false, stage: '', pct: 0 });
    }
  };

  const handleSubmitBatch = async (e: FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!batchDraft.brand.trim() && !batchDraft.productName.trim()) {
      setModalError('Enter a feed brand or product name before saving.');
      return;
    }

    await batchSubmitLock.runLocked(async () => {
      const costNum = Number(batchDraft.totalCost.trim());
      const totalCostCents =
        batchDraft.totalCost.trim() && Number.isFinite(costNum) && costNum >= 0
          ? Math.round(costNum * 100)
          : undefined;
      const proteinNum = Number(batchDraft.proteinPercent.trim());
      const proteinPercent =
        batchDraft.proteinPercent.trim() && Number.isFinite(proteinNum) && proteinNum > 0
          ? Math.round(proteinNum * 10) / 10
          : undefined;

      const ok = await onSaveFeedBatch({
        id: batchDraft.id,
        species: speciesProfile.name,
        brand: batchDraft.brand.trim(),
        productName: batchDraft.productName.trim(),
        lotNumber: batchDraft.lotNumber.trim(),
        millCode: batchDraft.millCode.trim(),
        manufactureDateIso: batchDraft.manufactureDateIso.trim(),
        purchaseDateIso: batchDraft.purchaseDateIso || todayDateIso(),
        bagCount: Math.max(0, Number(batchDraft.bagCount) || 0),
        bagWeightValue: Math.max(0, Number(batchDraft.bagWeightValue) || 0),
        bagWeightUnit: batchDraft.bagWeightUnit.trim() || 'lbs',
        totalQuantity: Math.max(0, Number(batchDraft.totalQuantity) || 0),
        remainingQuantity: Math.max(0, Number(batchDraft.remainingQuantity) || 0),
        lowStockThreshold: Math.max(0, Number(batchDraft.lowStockThreshold) || 0),
        totalCostCents,
        supplierName: batchDraft.supplierName.trim(),
        proteinPercent,
        notes: batchDraft.notes.trim(),
        tagPhotoDataUrl: batchDraft.tagPhotoDataUrl,
        tagPhotoThumbnailDataUrl: batchDraft.tagPhotoThumbnailDataUrl,
        tagPhotoMimeType: batchDraft.tagPhotoMimeType,
        tagPhotoBytes: batchDraft.tagPhotoBytes,
        tagPhotoCapturedDateIso: batchDraft.tagPhotoCapturedDateIso,
        tagPhotoPurgedAtIso: batchDraft.tagPhotoPurgedAtIso,
        tagPhotoBytesReclaimed: batchDraft.tagPhotoBytesReclaimed,
        ocrRawText: batchDraft.ocrRawText,
        ocrConfidence: batchDraft.ocrConfidence,
        ocrManualOverride: batchDraft.ocrManualOverride,
        recallFlagged: batchDraft.recallFlagged,
        recallNote: batchDraft.recallFlagged ? batchDraft.recallNote.trim() : undefined,
      });

      if (ok) {
        setBatchModalOpen(false);
      }
    });
  };

  const handleSubmitAllocation = async (e: FormEvent) => {
    e.preventDefault();
    setAllocFeedback(null);
    const batch = batchById.get(allocBatchId);
    if (!batch) {
      setAllocFeedback('Select a feed batch first.');
      return;
    }
    const qtyNum = Number(allocQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setAllocFeedback('Enter a quantity greater than 0.');
      return;
    }

    let resolvedTargetId = '';
    let resolvedTargetLabel = allocCustomLabel.trim() || 'General Barn';

    if (allocTargetType === 'cage') {
      const cage = cages.find((c) => c.id === allocTargetId);
      if (!cage) {
        setAllocFeedback('Choose a cage / pen or switch target type to General Barn.');
        return;
      }
      resolvedTargetId = cage.id;
      resolvedTargetLabel = cage.section ? `${cage.label} (${cage.section})` : cage.label;
    } else if (allocTargetType === 'litter') {
      const br = breedings.find((b) => b.id === allocTargetId);
      if (!br) {
        setAllocFeedback('Choose an active breeding / litter record.');
        return;
      }
      const female = activeData.herdById.get(br.damId)?.name || speciesProfile.femaleLabel;
      const male = activeData.herdById.get(br.sireId)?.name || speciesProfile.maleLabel;
      resolvedTargetId = br.id;
      resolvedTargetLabel = `${female} × ${male} (${br.status} · ${br.actualBirthDateIso || br.bredDateIso})`;
    } else if (allocTargetType === 'animal') {
      const animal = activeAnimals.find((a) => a.id === allocTargetId);
      if (!animal) {
        setAllocFeedback('Choose an animal record.');
        return;
      }
      resolvedTargetId = animal.id;
      resolvedTargetLabel = animal.tattoo ? `${animal.name} (${animal.tattoo})` : animal.name;
    }

    await allocSubmitLock.runLocked(async () => {
      const ok = await onLogFeedAllocation(
        {
          species: speciesProfile.name,
          feedBatchId: batch.id,
          targetType: allocTargetType,
          targetId: resolvedTargetId,
          targetLabel: resolvedTargetLabel,
          dateIso: allocDateIso || todayDateIso(),
          quantity: Math.round(qtyNum * 100) / 100,
          unit: allocUnit.trim() || batch.bagWeightUnit || 'lbs',
          notes: allocNotes.trim(),
        },
        { syncLinkedCageFeed: allocTargetType === 'cage' && syncLinkedCageFeed }
      );
      if (ok) {
        setAllocQty('');
        setAllocNotes('');
      }
    });
  };

  const handleSaveRecallFlag = async (batch: FeedBatch, nextFlagged: boolean, noteText: string) => {
    await rowActionLock.runKeyLocked(`recall:${batch.id}`, async () => {
      const ok = await onSaveFeedBatch({
        ...batch,
        recallFlagged: nextFlagged,
        recallNote: nextFlagged ? noteText.trim() || 'Flagged for lot trace check' : undefined,
      });
      if (ok) {
        setRecallEditBatchId(null);
        setRecallNoteDraft('');
      }
    });
  };

  const handleExportCsv = async () => {
    const csv = formatFeedLedgerCsv(
      feedBatches,
      feedAllocations,
      settings.currencyCode || 'USD'
    );
    const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await downloadTextFile(`${slug}-feed-ledger-${todayDateIso()}.csv`, csv, 'text/csv');
  };

  const handleCopyPhone = async (entryId: string, phone: string) => {
    await copyTextWithFallback(phone);
    setCopiedPhoneId(entryId);
    setTimeout(() => {
      setCopiedPhoneId((curr) => (curr === entryId ? null : curr));
    }, 2200);
  };

  const stockSummaryText =
    summary.totalsByUnit.length > 0
      ? summary.totalsByUnit.map((t) => `${t.remaining} ${t.unit}`).join(' · ')
      : '0 lbs';

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[36px] text-xs font-medium text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to {speciesProfile.name} Hub
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            {speciesProfile.name} Feed Inventory &amp; Lot Ledger
          </h1>
          <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
            Track purchased feed lots, allocate intake to pens or litters, scan mill lot stamps
            before compression, and auto-purge tag photos after indexing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={feedBatches.length === 0}
            onClick={() => void handleExportCsv()}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
          >
            <Download className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            Export Ledger (.CSV)
          </button>
          <button
            type="button"
            onClick={openNewBatchModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            Log Feed Purchase / Scan Tag
          </button>
        </div>
      </div>

      {/* Biosecurity Recall Warning Banner */}
      {summary.recallFlaggedBatches.length > 0 && (
        <section
          role="alert"
          aria-label="Feed recall and biosecurity watch alert"
          className="rounded-2xl border border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)] p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle
              className="w-5 h-5 text-[var(--barn-danger)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-0.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                {summary.recallFlaggedBatches.length} Flagged Feed Lot
                {summary.recallFlaggedBatches.length === 1 ? '' : 's'} Under Biosecurity Watch
              </div>
              <div className="text-[var(--barn-muted)] font-mono">
                {summary.recallFlaggedBatches
                  .map((b) => `${b.brand || b.productName} (Lot ${b.lotNumber || 'Unindexed'})`)
                  .join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const firstFlaggedLot = summary.recallFlaggedBatches[0]?.lotNumber || '';
              setLotTraceQuery(firstFlaggedLot);
              setActiveTab('biosecurity');
            }}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-danger)] text-white text-xs font-semibold shrink-0"
          >
            Trace Exposed Pens &amp; Litters
          </button>
        </section>
      )}

      {/* KPI Strip */}
      <section
        aria-label="Feed inventory summary metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--barn-muted)] font-medium">
            Active Stock
          </div>
          <div className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-[var(--barn-ink)] truncate">
            {stockSummaryText}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            {summary.activeBatches} active · {summary.depletedBatches} finished
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--barn-muted)] font-medium">
            Total Logged Spend
          </div>
          <div className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-[var(--barn-ink)]">
            {formatCurrencyCents(summary.totalSpendCents, settings.currencyCode || 'USD')}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            {summary.totalBatches} batch{summary.totalBatches === 1 ? '' : 'es'} recorded
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--barn-muted)] font-medium">
            Lots &amp; Allocations
          </div>
          <div className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-[var(--barn-ink)]">
            {summary.lotsIndexedCount} Lots · {summary.totalAllocationsCount} Feeds
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {summary.lowStockBatches.length > 0 ? (
              <span className="text-[var(--barn-terracotta)] font-semibold">
                {summary.lowStockBatches.length} batch low stock
              </span>
            ) : (
              'All active lots above threshold'
            )}
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-[var(--barn-muted)] font-medium">
            Tag Photo Footprint
          </div>
          <div className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-[var(--barn-ink)]">
            {summary.retainedTagPhotosCount} kept ({formatByteSizePure(summary.retainedTagPhotoBytes)})
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {summary.purgeEligibleCandidates.length > 0 ? (
              <span className="text-[var(--barn-sage)] font-semibold">
                {summary.purgeEligibleCandidates.length} ready for auto-purge
              </span>
            ) : (
              `${summary.purgedTagPhotosCount} purged (lots preserved)`
            )}
          </div>
        </div>
      </section>

      {/* Primary Section Tabs */}
      <div
        role="tablist"
        aria-label="Feed ledger views"
        className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] w-full sm:w-fit"
      >
        {(
          [
            {
              id: 'inventory',
              label: `Inventory & Lots (${feedBatches.length})`,
            },
            {
              id: 'allocations',
              label: `Intake Allocations (${feedAllocations.length})`,
            },
            {
              id: 'biosecurity',
              label: 'Biosecurity, Lot Trace & Manufacturers',
            },
          ] as const
        ).map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                selected
                  ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                  : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: INVENTORY & PURCHASES */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search
                className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search feed batches by brand, product, lot number, or supplier"
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Search brand, lot #, mill code, or supplier..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter feed batches">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'active', label: 'In Stock' },
                  { id: 'low_stock', label: 'Low Stock' },
                  { id: 'recalled', label: 'Recall Flagged' },
                  { id: 'has_photo', label: 'Tag Photo Kept' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={batchFilter === f.id}
                  onClick={() => setBatchFilter(f.id)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                    batchFilter === f.id
                      ? 'bg-[var(--barn-sage)] border-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
              <Package className="w-8 h-8 text-[var(--barn-sage)] mx-auto" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold">
                  {feedBatches.length === 0
                    ? `No ${speciesProfile.name} feed batches logged yet`
                    : 'No feed batches match your filter'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
                  Snap a photo of the sewn feed tag or receipt to auto-scan the mill lot number
                  before compression, or type purchase details manually.
                </p>
              </div>
              {feedBatches.length === 0 && (
                <button
                  type="button"
                  onClick={openNewBatchModal}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add First Feed Batch
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredBatches.map((batch) => {
                const lowStock = isFeedBatchLowStock(batch);
                const hasPhoto = Boolean(batch.tagPhotoDataUrl || batch.tagPhotoThumbnailDataUrl);
                const allocCount = allocationCountByBatchId.get(batch.id) || 0;
                const pctRemaining =
                  batch.totalQuantity > 0
                    ? Math.max(0, Math.min(100, Math.round((batch.remainingQuantity / batch.totalQuantity) * 100)))
                    : 0;
                const isConfirmDelete = confirmDeleteBatchId === batch.id;
                const isEditingRecall = recallEditBatchId === batch.id;

                return (
                  <article
                    key={batch.id}
                    className={`bg-[var(--barn-surface)] border rounded-2xl p-4 sm:p-5 space-y-3 ${
                      batch.recallFlagged
                        ? 'border-[var(--barn-danger)]'
                        : lowStock && batch.remainingQuantity > 0
                          ? 'border-[var(--barn-terracotta)]'
                          : 'border-[var(--barn-border)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-base sm:text-lg font-semibold text-[var(--barn-ink)]">
                            {[batch.brand, batch.productName].filter(Boolean).join(' · ') || 'Feed Batch'}
                          </h2>
                          {batch.recallFlagged && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-danger)] text-white text-[10.5px] font-semibold">
                              RECALL WATCH
                            </span>
                          )}
                          {lowStock && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border border-[var(--barn-terracotta)]/40 text-[10.5px] font-semibold">
                              {batch.remainingQuantity <= 0 ? 'Depleted' : 'Low Stock'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span>Purchased {formatReadableDate(batch.purchaseDateIso)}</span>
                          {batch.supplierName && <span>From {batch.supplierName}</span>}
                          {typeof batch.proteinPercent === 'number' && batch.proteinPercent > 0 && (
                            <span className="font-mono tabular-nums">
                              {batch.proteinPercent}% Protein
                            </span>
                          )}
                          {typeof batch.totalCostCents === 'number' && batch.totalCostCents > 0 && (
                            <span className="font-mono tabular-nums text-[var(--barn-ink)]">
                              {formatCurrencyCents(batch.totalCostCents, settings.currencyCode || 'USD')}
                            </span>
                          )}
                        </div>
                      </div>

                      {hasPhoto && (
                        <button
                          type="button"
                          onClick={() => setLightboxBatch(batch)}
                          title="Inspect feed tag photo"
                          aria-label={`Inspect feed tag photo for ${batch.brand || batch.productName}`}
                          className="w-14 h-14 rounded-xl overflow-hidden border border-[var(--barn-border)] hover:border-[var(--barn-sage)] shrink-0 bg-[var(--barn-canvas)]"
                        >
                          <img
                            src={batch.tagPhotoThumbnailDataUrl || batch.tagPhotoDataUrl}
                            alt={`Feed tag ${batch.lotNumber || batch.productName}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                    </div>

                    {/* Mill Lot & Code Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] px-3 py-2 text-xs">
                      <div>
                        <div className="text-[10.5px] text-[var(--barn-muted)]">Mill Lot #</div>
                        <div className="font-mono font-semibold text-[var(--barn-ink)] truncate">
                          {batch.lotNumber || 'Not indexed'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10.5px] text-[var(--barn-muted)]">Mill / Plant</div>
                        <div className="font-mono text-[var(--barn-ink)] truncate">
                          {batch.millCode || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10.5px] text-[var(--barn-muted)]">Mfr Date</div>
                        <div className="font-mono text-[var(--barn-ink)]">
                          {batch.manufactureDateIso ? formatReadableDate(batch.manufactureDateIso) : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Stock Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono tabular-nums font-semibold text-[var(--barn-ink)]">
                          {batch.remainingQuantity} / {batch.totalQuantity} {batch.bagWeightUnit} left
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                          {batch.bagCount} × {batch.bagWeightValue} {batch.bagWeightUnit} ·{' '}
                          {allocCount} allocation{allocCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pctRemaining}%`,
                            backgroundColor: batch.recallFlagged
                              ? 'var(--barn-danger)'
                              : lowStock
                                ? 'var(--barn-terracotta)'
                                : 'var(--barn-sage)',
                          }}
                        />
                      </div>
                    </div>

                    {/* Tag Photo Lifecycle Status */}
                    {!hasPhoto && batch.tagPhotoPurgedAtIso && (
                      <div className="rounded-lg bg-[var(--barn-sage-tint)]/60 border border-[var(--barn-sage)]/40 px-2.5 py-1.5 text-[11px] text-[var(--barn-ink)] flex items-center gap-1.5">
                        <ShieldCheck
                          className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          Tag photo biosecurity-purged on{' '}
                          {formatReadableDate(batch.tagPhotoPurgedAtIso.slice(0, 10))} · Lot
                          indexed · Reclaimed{' '}
                          <span className="font-mono tabular-nums font-semibold">
                            {formatByteSizePure(batch.tagPhotoBytesReclaimed || 0)}
                          </span>
                        </span>
                      </div>
                    )}

                    {batch.recallFlagged && batch.recallNote && (
                      <div className="rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)]/40 px-2.5 py-1.5 text-xs text-[var(--barn-ink)]">
                        <strong>Watch Note:</strong> {batch.recallNote}
                      </div>
                    )}

                    {batch.notes && (
                      <p className="text-xs text-[var(--barn-muted)] line-clamp-2">{batch.notes}</p>
                    )}

                    {/* Inline Recall Editor */}
                    {isEditingRecall && (
                      <div className="rounded-xl border border-[var(--barn-danger)] bg-[var(--barn-canvas)] p-3 space-y-2">
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-[var(--barn-ink)]">
                            Biosecurity / Recall Flag Reason
                          </span>
                          <input
                            type="text"
                            value={recallNoteDraft}
                            onChange={(e) => setRecallNoteDraft(e.target.value)}
                            placeholder="e.g. Mold odor, feed refusal, or manufacturer recall notice"
                            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={rowActionLock.isKeyLocked(`recall:${batch.id}`)}
                            onClick={() =>
                              void handleSaveRecallFlag(batch, true, recallNoteDraft)
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-white text-xs font-semibold disabled:opacity-50"
                          >
                            Confirm Recall Flag
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRecallEditBatchId(null);
                              setRecallNoteDraft('');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAllocBatchId(batch.id);
                            setAllocUnit(batch.bagWeightUnit || 'lbs');
                            setActiveTab('allocations');
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs font-semibold text-[var(--barn-ink)] hover:opacity-90"
                        >
                          Log Intake
                        </button>
                        {batch.recallFlagged ? (
                          <button
                            type="button"
                            disabled={rowActionLock.isKeyLocked(`recall:${batch.id}`)}
                            onClick={() => void handleSaveRecallFlag(batch, false, '')}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-50"
                          >
                            Clear Recall Flag
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRecallEditBatchId(batch.id);
                              setRecallNoteDraft(batch.recallNote || '');
                            }}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-danger)] inline-flex items-center gap-1"
                          >
                            <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                            Flag Recall
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditBatchModal(batch)}
                          aria-label={`Edit feed batch ${batch.brand || batch.productName}`}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>

                        {!isConfirmDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBatchId(batch.id)}
                            aria-label={`Delete feed batch ${batch.brand || batch.productName}`}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] hover:border-[var(--barn-danger)] hover:text-[var(--barn-danger)] text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Delete
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={rowActionLock.isKeyLocked(`delBatch:${batch.id}`)}
                              onClick={() =>
                                void rowActionLock.runKeyLocked(`delBatch:${batch.id}`, async () => {
                                  await onDeleteFeedBatch(batch.id);
                                  setConfirmDeleteBatchId(null);
                                })
                              }
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-danger)] text-white text-xs font-semibold disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteBatchId(null)}
                              className="min-h-[36px] px-2 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INTAKE ALLOCATIONS */}
      {activeTab === 'allocations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={(e) => void handleSubmitAllocation(e)}
            className="lg:col-span-5 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4"
          >
            <div className="space-y-0.5">
              <h2 className="font-display text-lg font-semibold">Log Intake / Allocation</h2>
              <p className="text-xs text-[var(--barn-muted)]">
                Deducts feed from the selected batch and links the lot directly to a pen, litter,
                or animal for full biosecurity traceability.
              </p>
            </div>

            {feedBatches.length === 0 ? (
              <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-4 text-xs text-[var(--barn-muted)] space-y-2">
                <p>Add a purchased feed batch first before logging intake allocations.</p>
                <button
                  type="button"
                  onClick={openNewBatchModal}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
                >
                  Log Feed Purchase
                </button>
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Feed Batch *</span>
                  <select
                    value={allocBatchId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setAllocBatchId(nextId);
                      const matched = batchById.get(nextId);
                      if (matched) setAllocUnit(matched.bagWeightUnit || 'lbs');
                    }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  >
                    {feedBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {[b.brand, b.productName].filter(Boolean).join(' ')}{' '}
                        {b.lotNumber ? `(Lot ${b.lotNumber})` : ''} — {b.remainingQuantity}{' '}
                        {b.bagWeightUnit} left
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">Target Type</span>
                    <select
                      value={allocTargetType}
                      onChange={(e) =>
                        setAllocTargetType(e.target.value as FeedAllocationTargetType)
                      }
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    >
                      <option value="cage">Cage / Pen ({cages.length})</option>
                      <option value="litter">Litter / Pairing ({breedings.length})</option>
                      <option value="animal">Individual {speciesProfile.name} ({activeAnimals.length})</option>
                      <option value="general">General Barn Group</option>
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">Date</span>
                    <input
                      type="date"
                      value={allocDateIso}
                      onChange={(e) => setAllocDateIso(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                    />
                  </label>
                </div>

                {allocTargetType === 'cage' && (
                  <div className="space-y-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-[var(--barn-muted)]">
                        {speciesProfile.name} Cage / Pen
                      </span>
                      <select
                        value={allocTargetId}
                        onChange={(e) => setAllocTargetId(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                      >
                        {cages.length === 0 ? (
                          <option value="">No cages/pens added yet</option>
                        ) : (
                          cages.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                              {c.section ? ` — ${c.section}` : ''}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="inline-flex items-start gap-2 text-xs text-[var(--barn-muted)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={syncLinkedCageFeed}
                        onChange={(e) => setSyncLinkedCageFeed(e.target.checked)}
                        className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                      />
                      <span>
                        Also update linked Cage/Pen feed lot name &amp; remaining hopper stock
                      </span>
                    </label>
                  </div>
                )}

                {allocTargetType === 'litter' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">
                      Active Litter / Breeding Record
                    </span>
                    <select
                      value={allocTargetId}
                      onChange={(e) => setAllocTargetId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    >
                      {breedings.length === 0 ? (
                        <option value="">No breedings/litters recorded</option>
                      ) : (
                        breedings.map((br) => {
                          const dam =
                            activeData.herdById.get(br.damId)?.name ||
                            speciesProfile.femaleLabel;
                          const sire =
                            activeData.herdById.get(br.sireId)?.name ||
                            speciesProfile.maleLabel;
                          return (
                            <option key={br.id} value={br.id}>
                              {dam} × {sire} · {br.status} ({br.actualBirthDateIso || br.bredDateIso})
                            </option>
                          );
                        })
                      )}
                    </select>
                  </label>
                )}

                {allocTargetType === 'animal' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">
                      Individual {speciesProfile.name}
                    </span>
                    <select
                      value={allocTargetId}
                      onChange={(e) => setAllocTargetId(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    >
                      {activeAnimals.length === 0 ? (
                        <option value="">No active animals</option>
                      ) : (
                        activeAnimals.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.tattoo ? ` (${a.tattoo})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                )}

                {allocTargetType === 'general' && (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">
                      Barn Group / Section Label
                    </span>
                    <input
                      type="text"
                      value={allocCustomLabel}
                      onChange={(e) => setAllocCustomLabel(e.target.value)}
                      placeholder="e.g. Growout Row B or Main Barn Bins"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">Quantity *</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.25"
                      required
                      value={allocQty}
                      onChange={(e) => setAllocQty(e.target.value)}
                      placeholder="e.g. 25"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-[var(--barn-muted)]">Unit</span>
                    <input
                      type="text"
                      value={allocUnit}
                      onChange={(e) => setAllocUnit(e.target.value)}
                      placeholder="lbs / kg / bags"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Notes (Optional)</span>
                  <input
                    type="text"
                    value={allocNotes}
                    onChange={(e) => setAllocNotes(e.target.value)}
                    placeholder="e.g. Morning bin refill or creep feeder switch"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  />
                </label>

                {allocFeedback && (
                  <div
                    role="alert"
                    className="rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] px-3 py-2 text-xs text-[var(--barn-ink)]"
                  >
                    {allocFeedback}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={allocSubmitLock.isSubmitting}
                  aria-busy={allocSubmitLock.isSubmitting}
                  className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs sm:text-sm font-semibold disabled:opacity-55"
                >
                  {allocSubmitLock.isSubmitting ? 'Logging Intake...' : 'Save Feed Allocation'}
                </button>
              </>
            )}
          </form>

          <section className="lg:col-span-7 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-lg font-semibold">
              Recent Intake Allocations ({feedAllocations.length})
            </h2>

            {feedAllocations.length === 0 ? (
              <p className="text-xs text-[var(--barn-muted)] py-4">
                No intake allocations logged for {speciesProfile.name} yet. Every bag or scoop
                allocated here automatically tracks lot exposure by pen or litter.
              </p>
            ) : (
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
                {feedAllocations.map((al) => {
                  const batch = batchById.get(al.feedBatchId);
                  const isConfirmDelete = confirmDeleteAllocId === al.id;
                  return (
                    <div
                      key={al.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
                            {al.quantity} {al.unit}
                          </span>
                          <span className="text-[var(--barn-muted)]">→</span>
                          {al.targetType === 'animal' && al.targetId ? (
                            <button
                              type="button"
                              onClick={() => onOpenAnimal(al.targetId)}
                              className="font-semibold text-[var(--barn-sage)] hover:underline text-left"
                            >
                              {al.targetLabel}
                            </button>
                          ) : (
                            <span className="font-semibold text-[var(--barn-ink)]">
                              {al.targetLabel}
                            </span>
                          )}
                          <span className="text-[10.5px] uppercase tracking-wider text-[var(--barn-muted)]">
                            ({al.targetType})
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap gap-x-2">
                          <span>{formatReadableDate(al.dateIso)}</span>
                          <span>
                            ·{' '}
                            {batch
                              ? `${[batch.brand, batch.productName].filter(Boolean).join(' ')}${
                                  batch.lotNumber ? ` (Lot ${batch.lotNumber})` : ''
                                }`
                              : 'Removed batch'}
                          </span>
                          {al.notes && <span>· {al.notes}</span>}
                        </div>
                      </div>

                      {!isConfirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAllocId(al.id)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:border-[var(--barn-danger)] hover:text-[var(--barn-danger)] text-[11px] font-medium shrink-0"
                        >
                          Remove
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={rowActionLock.isKeyLocked(`delAlloc:${al.id}`)}
                            onClick={() =>
                              void rowActionLock.runKeyLocked(`delAlloc:${al.id}`, async () => {
                                await onDeleteFeedAllocation(al.id);
                                setConfirmDeleteAllocId(null);
                              })
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-danger)] text-white text-[11px] font-semibold"
                          >
                            Restore &amp; Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAllocId(null)}
                            className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: BIOSECURITY, LOT TRACEABILITY & MANUFACTURER DIRECTORY */}
      {activeTab === 'biosecurity' && (
        <div className="space-y-6">
          {/* 1. Biosecurity Tag-Photo Auto-Purge Policy */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 max-w-2xl">
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
                  Biosecurity Tag-Photo Auto-Purge Policy
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  To protect device storage from accumulating heavy receipt &amp; tag photos,
                  compressed tag images are automatically purged after your chosen window{' '}
                  <strong>only once a mill lot number is indexed</strong>. Lot numbers, mill codes,
                  and OCR text always stay permanently in the ledger.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  purgeSubmitLock.isSubmitting ||
                  purgeWindowDays === 0 ||
                  summary.purgeEligibleCandidates.length === 0
                }
                aria-busy={purgeSubmitLock.isSubmitting}
                onClick={() =>
                  void purgeSubmitLock.runLocked(() =>
                    onRunBiosecurityPurge({ windowDays: purgeWindowDays })
                  )
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-45 shrink-0"
              >
                {purgeSubmitLock.isSubmitting
                  ? 'Purging...'
                  : `Purge Eligible Tag Photos Now (${summary.purgeEligibleCandidates.length})`}
              </button>
            </div>

            <div
              role="radiogroup"
              aria-label="Feed tag photo biosecurity retention window"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5"
            >
              {FEED_PURGE_WINDOW_OPTIONS.map((opt) => {
                const selected = purgeWindowDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onUpdateSettings({ feedTagPurgeWindowDays: opt.days }, { silent: true })
                    }
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      selected
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]/50'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">{opt.label}</div>
                    <div className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {summary.purgeEligibleCandidates.length > 0 && (
              <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 space-y-1.5 text-xs">
                <div className="font-semibold text-[var(--barn-ink)]">
                  Ready to Purge ({summary.purgeEligibleCandidates.length} indexed photo
                  {summary.purgeEligibleCandidates.length === 1 ? '' : 's'}):
                </div>
                <div className="space-y-1">
                  {summary.purgeEligibleCandidates.map((cand) => (
                    <div
                      key={cand.batch.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)]"
                    >
                      <span>
                        <strong className="text-[var(--barn-ink)]">
                          {cand.batch.brand || cand.batch.productName}
                        </strong>{' '}
                        · Lot <span className="font-mono">{cand.batch.lotNumber}</span> · captured{' '}
                        {formatReadableDate(cand.capturedDateIso)}
                      </span>
                      <span className="font-mono tabular-nums">
                        {cand.daysSinceCapture}d old ·{' '}
                        {formatByteSizePure(cand.bytesToReclaim)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 2. Lot Traceability Lookup */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold">
                Lot Traceability &amp; Recall Exposure Lookup
              </h2>
              <p className="text-xs text-[var(--barn-muted)]">
                Enter any mill lot number, plant code, or feed brand to immediately locate every
                cage, pen, active litter, and animal fed from that lot.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Trace feed lot number or mill code"
                  value={lotTraceQuery}
                  onChange={(e) => setLotTraceQuery(e.target.value)}
                  placeholder="Enter lot # (e.g. 4291A-0814) or brand..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                />
              </div>
              {distinctIndexedLots.slice(0, 6).map((item) => (
                <button
                  key={item.lotNumber}
                  type="button"
                  onClick={() => setLotTraceQuery(item.lotNumber)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border font-mono text-xs ${
                    item.recallFlagged
                      ? 'border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-danger)] font-semibold'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-ink)] hover:border-[var(--barn-sage)]'
                  }`}
                >
                  {item.lotNumber}
                </button>
              ))}
            </div>

            {lotTraces.length === 0 ? (
              <p className="text-xs text-[var(--barn-muted)]">
                {lotTraceQuery.trim()
                  ? `No batches matched "${lotTraceQuery.trim()}".`
                  : 'No recall-flagged lots right now. Type or tap a lot code above to trace exposed cages & litters.'}
              </p>
            ) : (
              <div className="space-y-3">
                {lotTraces.map((trace) => (
                  <div
                    key={trace.lotKey}
                    className={`rounded-xl border p-4 space-y-2 text-xs ${
                      trace.hasRecallFlag
                        ? 'border-[var(--barn-danger)] bg-[var(--barn-terracotta-tint)]/55'
                        : 'border-[var(--barn-border)] bg-[var(--barn-canvas)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono font-semibold text-sm text-[var(--barn-ink)]">
                        Lot {trace.lotNumber}
                        {trace.hasRecallFlag && (
                          <span className="ml-2 text-xs text-[var(--barn-danger)]">
                            (RECALL WATCH)
                          </span>
                        )}
                      </div>
                      <div className="font-mono tabular-nums text-[var(--barn-muted)]">
                        {trace.batches.length} batch{trace.batches.length === 1 ? '' : 'es'} ·{' '}
                        {trace.allocations.length} allocation
                        {trace.allocations.length === 1 ? '' : 's'} ({trace.totalAllocated} units
                        fed)
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                      <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5">
                        <div className="font-semibold text-[var(--barn-ink)] mb-1">
                          Cages / Pens ({trace.linkedCages.length})
                        </div>
                        {trace.linkedCages.length === 0 ? (
                          <span className="text-[var(--barn-muted)]">None linked</span>
                        ) : (
                          <ul className="space-y-0.5 text-[var(--barn-muted)]">
                            {trace.linkedCages.map((c) => (
                              <li key={c.id}>
                                {c.label}
                                {c.section ? ` (${c.section})` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5">
                        <div className="font-semibold text-[var(--barn-ink)] mb-1">
                          Litters / Pairings ({trace.linkedBreedings.length})
                        </div>
                        {trace.linkedBreedings.length === 0 ? (
                          <span className="text-[var(--barn-muted)]">None linked</span>
                        ) : (
                          <ul className="space-y-0.5 text-[var(--barn-muted)]">
                            {trace.linkedBreedings.map((br) => {
                              const dam = activeData.herdById.get(br.damId)?.name || 'Dam';
                              const sire = activeData.herdById.get(br.sireId)?.name || 'Sire';
                              return (
                                <li key={br.id}>
                                  {dam} × {sire} ({br.status})
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5">
                        <div className="font-semibold text-[var(--barn-ink)] mb-1">
                          Animals ({trace.linkedAnimals.length})
                        </div>
                        {trace.linkedAnimals.length === 0 ? (
                          <span className="text-[var(--barn-muted)]">None linked</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {trace.linkedAnimals.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => onOpenAnimal(a.id)}
                                className="text-[var(--barn-sage)] font-semibold hover:underline"
                              >
                                {a.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Offline Manufacturer Emergency Directory */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="font-display text-lg font-semibold">
                  Offline Feed Manufacturer Emergency &amp; Recall Directory
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Bundled directly inside the offline PWA so mill hotlines, lot-code decoding
                  tips, FDA CVM reporting, and ARBA feed-issue watch links remain available even
                  without barn cell signal.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search feed manufacturer directory"
                  value={dirSearch}
                  onChange={(e) => setDirSearch(e.target.value)}
                  placeholder="Search Purina, Nutrena, Kent, Kalmbach, FDA..."
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter directory by category"
                  value={dirCategory}
                  onChange={(e) =>
                    setDirCategory(e.target.value as FeedDirectoryCategory | 'all')
                  }
                  className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="all">All Categories</option>
                  <option value="manufacturer">Manufacturers</option>
                  <option value="regulatory">Regulatory (FDA CVM)</option>
                  <option value="community_watch">Community Watch</option>
                </select>

                <label className="inline-flex items-center gap-1.5 text-xs text-[var(--barn-muted)] cursor-pointer select-none px-2">
                  <input
                    type="checkbox"
                    checked={dirSpeciesOnly}
                    onChange={(e) => setDirSpeciesOnly(e.target.checked)}
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Match {speciesProfile.name}</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {directoryMatches.map((entry) => {
                const telHref = `tel:${entry.hotlinePhone.replace(/[^0-9+]/g, '')}`;
                const copied = copiedPhoneId === entry.id;
                return (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-sm text-[var(--barn-ink)]">
                          {entry.name}
                        </h3>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          {entry.parentCompany} · {entry.hotlineHours}
                        </div>
                      </div>
                      <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--barn-sage)] shrink-0">
                        {entry.category.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={telHref}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-mono font-semibold inline-flex items-center gap-1.5 hover:opacity-95"
                      >
                        <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                        {entry.hotlinePhone}
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleCopyPhone(entry.id, entry.hotlinePhone)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 font-medium"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            Copy #
                          </>
                        )}
                      </button>
                    </div>

                    <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5 text-[11px] space-y-1">
                      <div>
                        <strong className="text-[var(--barn-ink)]">Lot Stamp Hint:</strong>{' '}
                        <span className="text-[var(--barn-muted)]">{entry.lotCodeHint}</span>
                      </div>
                      <div className="text-[var(--barn-muted)]">{entry.communityWatchNote}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] font-semibold">
                      <a
                        href={entry.qualityReportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--barn-sage)] hover:underline inline-flex items-center gap-1"
                      >
                        Report Quality Issue
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                      <a
                        href={entry.recallWatchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--barn-terracotta)] hover:underline inline-flex items-center gap-1"
                      >
                        Recall &amp; Safety Watch
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* FEED BATCH + PRE-COMPRESSION TAG OCR MODAL */}
      {batchModalOpen && (
        <div
          ref={batchDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-batch-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !batchSubmitLock.isSubmitting && !ocrProgress.busy) {
              setBatchModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[var(--barn-border)] flex items-start justify-between gap-3">
              <div>
                <h2 id="feed-batch-modal-title" className="font-display text-xl font-semibold">
                  {batchDraft.id ? 'Edit Feed Batch & Lot Record' : 'Log Feed Purchase & Scan Tag'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Pre-compression OCR reads mill lot stamps at full resolution before shrinking the
                  stored tag photo cleanly for offline SQLite.
                </p>
              </div>
              <button
                type="button"
                disabled={batchSubmitLock.isSubmitting || ocrProgress.busy}
                onClick={() => setBatchModalOpen(false)}
                aria-label="Close feed batch editor"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center disabled:opacity-45"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSubmitBatch(e)}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {/* Pre-Compression OCR Capture Box */}
              <div className="rounded-2xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      Feed Bag Tag / Receipt Scanner (Pre-Compression OCR)
                    </div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Snap the sewn paper feed tag or receipt; detected lot codes appear as
                      one-tap pills below.
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => void handleTagPhotoSelected(e)}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    disabled={ocrProgress.busy}
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-55"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    {batchDraft.tagPhotoDataUrl ? 'Rescan Tag Photo' : 'Scan / Upload Tag'}
                  </button>
                </div>

                {ocrProgress.busy && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[var(--barn-muted)]">
                      <span>{ocrProgress.stage}</span>
                      <span className="font-mono tabular-nums">{ocrProgress.pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--barn-sage)] transition-all"
                        style={{ width: `${ocrProgress.pct}%` }}
                      />
                    </div>
                  </div>
                )}

                {ocrResult?.warningMessage && (
                  <div className="rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/50 px-3 py-2 text-xs text-[var(--barn-ink)]">
                    {ocrResult.warningMessage}
                  </div>
                )}

                {ocrResult && ocrResult.parsed.lotCandidates.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                      Detected Lot Candidates ({ocrResult.engine} · {ocrResult.confidence}% conf.):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ocrResult.parsed.lotCandidates.map((cand) => {
                        const active = batchDraft.lotNumber.trim().toUpperCase() === cand;
                        return (
                          <button
                            key={cand}
                            type="button"
                            onClick={() =>
                              setBatchDraft((prev) => ({
                                ...prev,
                                lotNumber: cand,
                              }))
                            }
                            className={`min-h-[32px] px-2.5 py-1 rounded-lg border font-mono text-xs font-semibold ${
                              active
                                ? 'bg-[var(--barn-sage)] border-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                                : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-ink)]'
                            }`}
                          >
                            {cand}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(batchDraft.tagPhotoDataUrl || batchDraft.tagPhotoThumbnailDataUrl) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      <img
                        src={batchDraft.tagPhotoThumbnailDataUrl || batchDraft.tagPhotoDataUrl}
                        alt="Captured feed tag preview"
                        className="w-16 h-16 rounded-xl object-cover border border-[var(--barn-border)]"
                      />
                      <div className="text-[11px] text-[var(--barn-muted)] space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          Tag photo stored compactly
                        </div>
                        <div className="font-mono tabular-nums">
                          {formatByteSizePure(batchDraft.tagPhotoBytes || 0)} · Captured{' '}
                          {formatReadableDate(batchDraft.tagPhotoCapturedDateIso || todayDateIso())}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBatchDraft((prev) => ({
                          ...prev,
                          tagPhotoDataUrl: undefined,
                          tagPhotoThumbnailDataUrl: undefined,
                          tagPhotoBytes: undefined,
                        }))
                      }
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:text-[var(--barn-danger)]"
                    >
                      Remove Photo
                    </button>
                  </div>
                )}

                {batchDraft.ocrRawText && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawOcrText((v) => !v)}
                      className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                    >
                      {showRawOcrText ? 'Hide raw OCR text' : 'Inspect raw OCR text'}
                    </button>
                    {showRawOcrText && (
                      <pre className="mt-1.5 max-h-28 overflow-y-auto rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2 text-[10.5px] font-mono whitespace-pre-wrap text-[var(--barn-muted)]">
                        {batchDraft.ocrRawText}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Mill Lot Override + Stamp Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Mill Lot Number
                  </span>
                  <input
                    type="text"
                    value={batchDraft.lotNumber}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, lotNumber: e.target.value })
                    }
                    placeholder="e.g. 4291A-0814"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Mill / Plant Code
                  </span>
                  <input
                    type="text"
                    value={batchDraft.millCode}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, millCode: e.target.value })
                    }
                    placeholder="e.g. P12"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Manufacture Date
                  </span>
                  <input
                    type="date"
                    value={batchDraft.manufactureDateIso}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, manufactureDateIso: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                  />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[var(--barn-muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchDraft.ocrManualOverride}
                  onChange={(e) =>
                    setBatchDraft({ ...batchDraft, ocrManualOverride: e.target.checked })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Lock manual lot override (faded stamp — do not overwrite lot # on re-scan)
                </span>
              </label>

              {/* Brand & Product */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Feed Brand / Manufacturer *
                  </span>
                  <input
                    ref={batchBrandInputRef}
                    type="text"
                    list="feed-brand-directory-list"
                    value={batchDraft.brand}
                    onChange={(e) => setBatchDraft({ ...batchDraft, brand: e.target.value })}
                    placeholder="e.g. Purina, Nutrena, Kalmbach, Kent"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  />
                  <datalist id="feed-brand-directory-list">
                    {FEED_MANUFACTURER_DIRECTORY.filter((d) => d.category === 'manufacturer').map(
                      (d) => (
                        <option key={d.id} value={d.name.split(' (')[0].split(' /')[0]} />
                      )
                    )}
                  </datalist>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Formula / Product Name
                  </span>
                  <input
                    type="text"
                    value={batchDraft.productName}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, productName: e.target.value })
                    }
                    placeholder="e.g. Show Hutch 17% Pellet"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  />
                </label>
              </div>

              {matchedManufacturerHint && (
                <div className="rounded-xl bg-[var(--barn-sage-tint)]/55 border border-[var(--barn-sage)]/40 px-3 py-2 text-[11px] text-[var(--barn-ink)] space-y-0.5">
                  <div className="font-semibold">
                    Matched Directory Contact: {matchedManufacturerHint.name} (
                    <span className="font-mono">{matchedManufacturerHint.hotlinePhone}</span>)
                  </div>
                  <div className="text-[var(--barn-muted)]">
                    {matchedManufacturerHint.lotCodeHint}
                  </div>
                </div>
              )}

              {/* Bags, Weight & Quantities */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Bags / Bales</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={batchDraft.bagCount}
                    onChange={(e) => updateBagMath({ bagCount: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Wt / Bag</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={batchDraft.bagWeightValue}
                    onChange={(e) => updateBagMath({ bagWeightValue: e.target.value })}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Unit</span>
                  <input
                    type="text"
                    value={batchDraft.bagWeightUnit}
                    onChange={(e) => updateBagMath({ bagWeightUnit: e.target.value })}
                    placeholder="lbs"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Purchase Date</span>
                  <input
                    type="date"
                    value={batchDraft.purchaseDateIso}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, purchaseDateIso: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Total Purchased Qty
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={batchDraft.totalQuantity}
                    onChange={(e) =>
                      setBatchDraft({
                        ...batchDraft,
                        totalQuantity: e.target.value,
                        totalManuallyEdited: true,
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Remaining Qty
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={batchDraft.remainingQuantity}
                    onChange={(e) =>
                      setBatchDraft({
                        ...batchDraft,
                        remainingQuantity: e.target.value,
                        remainingManuallyEdited: true,
                      })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Low-Stock Alert At
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={batchDraft.lowStockThreshold}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, lowStockThreshold: e.target.value })
                    }
                    placeholder="e.g. 25"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Total Cost ({settings.currencyCode || 'USD'})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={batchDraft.totalCost}
                    onChange={(e) => setBatchDraft({ ...batchDraft, totalCost: e.target.value })}
                    placeholder="e.g. 46.50"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">Protein %</span>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    step="0.1"
                    value={batchDraft.proteinPercent}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, proteinPercent: e.target.value })
                    }
                    placeholder="e.g. 17.0"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm font-mono tabular-nums"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--barn-muted)]">
                    Supplier / Feed Store
                  </span>
                  <input
                    type="text"
                    value={batchDraft.supplierName}
                    onChange={(e) =>
                      setBatchDraft({ ...batchDraft, supplierName: e.target.value })
                    }
                    placeholder="e.g. Valley Co-op"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--barn-muted)]">Notes</span>
                <textarea
                  rows={2}
                  value={batchDraft.notes}
                  onChange={(e) => setBatchDraft({ ...batchDraft, notes: e.target.value })}
                  placeholder="Condition on delivery, pellet firmness, pallet/storage bin notes..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs sm:text-sm"
                />
              </label>

              {modalError && (
                <div
                  role="alert"
                  className="rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] px-3 py-2 text-xs text-[var(--barn-ink)]"
                >
                  {modalError}
                </div>
              )}

              <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={batchSubmitLock.isSubmitting || ocrProgress.busy}
                  onClick={() => setBatchModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs sm:text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={batchSubmitLock.isSubmitting || ocrProgress.busy}
                  aria-busy={batchSubmitLock.isSubmitting}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs sm:text-sm font-semibold disabled:opacity-55"
                >
                  {batchSubmitLock.isSubmitting
                    ? 'Saving...'
                    : batchDraft.id
                      ? 'Save Feed Batch'
                      : 'Add Feed Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAG PHOTO LIGHTBOX DIALOG */}
      {lightboxBatch && (
        <div
          ref={lightboxDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feed-tag-lightbox-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxBatch(null);
          }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-[var(--barn-border)] flex items-start justify-between gap-3">
              <div>
                <h2 id="feed-tag-lightbox-title" className="font-display text-lg font-semibold">
                  {[lightboxBatch.brand, lightboxBatch.productName].filter(Boolean).join(' · ') ||
                    'Feed Tag Photo'}
                </h2>
                <p className="text-xs font-mono text-[var(--barn-muted)]">
                  Lot {lightboxBatch.lotNumber || 'Unindexed'}
                  {lightboxBatch.millCode ? ` · Mill ${lightboxBatch.millCode}` : ''}
                  {lightboxBatch.tagPhotoCapturedDateIso
                    ? ` · Scanned ${formatReadableDate(lightboxBatch.tagPhotoCapturedDateIso)}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxBatch(null)}
                aria-label="Close feed tag photo preview"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-[var(--barn-canvas)] flex justify-center max-h-[75vh] overflow-auto">
              <img
                src={lightboxBatch.tagPhotoDataUrl || lightboxBatch.tagPhotoThumbnailDataUrl}
                alt={`Feed tag ${lightboxBatch.lotNumber || lightboxBatch.productName}`}
                className="max-w-full max-h-[68vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

## `src/components/FounderAndHeritabilityPanel.tsx`

```tsx
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Founder Loss, Ancestor Genetic Contribution & Heritability (h²) Analytics Panel.
 *
 * Embedded in Pedigree Explorer (`mode="pedigree"`) and Breeding Lab (`mode="breeding"`).
 */

import { ArrowRight, BarChart3, Dna, GitBranch, ShieldAlert, TrendingUp } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  Animal,
  BreedingRecord,
  CareLog,
  formatWeight,
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import {
  analyzeAnimalFounderContributions,
  analyzePairingFounderShift,
  analyzeSpeciesFounderLoss,
  analyzeSpeciesHeritabilityTrends,
  FounderStatusCode,
} from '../core/pedigreeAnalytics';

interface FounderAndHeritabilityPanelProps {
  mode: 'pedigree' | 'breeding';
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  herdById: Map<string, Animal>;
  breedings: BreedingRecord[];
  careLogs: CareLog[];
  subject?: Animal | null;
  selectedSire?: Animal | null;
  selectedDam?: Animal | null;
  preferredUnit?: WeightUnit;
  onSelectAnimal?: (animalId: string) => void;
}

type FounderFilterTab = 'all' | FounderStatusCode;

export function FounderAndHeritabilityPanel({
  mode,
  speciesProfile,
  animals,
  herdById,
  breedings,
  careLogs,
  subject,
  selectedSire,
  selectedDam,
  preferredUnit = 'lbs_oz',
  onSelectAnimal,
}: FounderAndHeritabilityPanelProps) {
  const [founderFilter, setFounderFilter] = useState<FounderFilterTab>('all');
  const [ancestorScope, setAncestorScope] = useState<'founders' | 'all_ancestors'>('founders');
  const [breedingTab, setBreedingTab] = useState<'heritability' | 'founder_loss'>('heritability');

  const founderLossReport = useMemo(
    () => analyzeSpeciesFounderLoss(animals, speciesProfile.name),
    [animals, speciesProfile.name]
  );

  const heritabilityReport = useMemo(
    () =>
      analyzeSpeciesHeritabilityTrends({
        animals,
        breedings,
        careLogs,
        speciesName: speciesProfile.name,
      }),
    [animals, breedings, careLogs, speciesProfile.name]
  );

  const subjectAnalysis = useMemo(() => {
    if (mode !== 'pedigree' || !subject) return null;
    return analyzeAnimalFounderContributions(subject, herdById);
  }, [mode, subject, herdById]);

  const pairingShift = useMemo(() => {
    if (mode !== 'breeding' || !selectedSire || !selectedDam) return null;
    return analyzePairingFounderShift(selectedSire, selectedDam, herdById);
  }, [mode, selectedSire, selectedDam, herdById]);

  const filteredLedger = useMemo(() => {
    if (founderFilter === 'all') return founderLossReport.founderLedger;
    return founderLossReport.founderLedger.filter((row) => row.status === founderFilter);
  }, [founderLossReport.founderLedger, founderFilter]);

  const statusTextColor = (status: FounderStatusCode): string => {
    if (status === 'Lost') return 'text-[var(--barn-danger)] font-semibold';
    if (status === 'Endangered') return 'text-[var(--barn-terracotta)] font-semibold';
    return 'text-[var(--barn-sage)] font-semibold';
  };

  const renderCohortSvgChart = () => {
    const cohorts = heritabilityReport.cohorts;
    if (cohorts.length < 2) {
      return (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs text-[var(--barn-muted)]">
          Record birth dates (`YYYY-MM-DD`) across at least 2 birth years to plot chronological
          Effective Founders (<span className="font-mono">fe</span>), Mean COI, and Weight{' '}
          <span className="font-mono">h²</span> trends.
        </div>
      );
    }

    const width = 640;
    const height = 190;
    const padL = 42;
    const padR = 42;
    const padT = 18;
    const padB = 30;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxFe = Math.max(
      4,
      ...cohorts.map((c) => c.meanEffectiveFoundersFe || 0)
    );
    const maxCoi = Math.max(
      12.5,
      ...cohorts.map((c) => c.meanCoiPercent || 0)
    );

    const xAt = (idx: number) =>
      cohorts.length === 1 ? padL + plotW / 2 : padL + (idx / (cohorts.length - 1)) * plotW;
    const yFe = (val: number) => padT + plotH - (Math.min(maxFe, val) / maxFe) * plotH;
    const yCoi = (val: number) => padT + plotH - (Math.min(maxCoi, val) / maxCoi) * plotH;
    const yH2 = (val: number) => padT + plotH - Math.min(1, Math.max(0, val)) * plotH;

    const fePoints = cohorts.map((c, i) => `${xAt(i).toFixed(1)},${yFe(c.meanEffectiveFoundersFe).toFixed(1)}`).join(' ');
    const coiPoints = cohorts.map((c, i) => `${xAt(i).toFixed(1)},${yCoi(c.meanCoiPercent).toFixed(1)}`).join(' ');
    const h2Coords = cohorts
      .map((c, i) =>
        c.cumulativeWeightH2 !== null
          ? `${xAt(i).toFixed(1)},${yH2(c.cumulativeWeightH2).toFixed(1)}`
          : null
      )
      .filter((pt): pt is string => pt !== null);

    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${speciesProfile.name} birth-year cohort trend chart for Effective Founders fe, Mean COI percent, and Cumulative Weight h-squared`}
            className="w-full min-w-[440px] h-[185px]"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padT + plotH * (1 - frac);
              return (
                <g key={frac}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--barn-border)"
                    strokeWidth="1"
                    strokeDasharray={frac === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {(maxFe * frac).toFixed(1)}
                  </text>
                  <text
                    x={width - padR + 6}
                    y={y + 3}
                    textAnchor="start"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {(maxCoi * frac).toFixed(0)}%
                  </text>
                </g>
              );
            })}

            <polyline
              fill="none"
              stroke="var(--barn-sage)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={fePoints}
            />
            <polyline
              fill="none"
              stroke="var(--barn-terracotta)"
              strokeWidth="2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={coiPoints}
            />
            {h2Coords.length >= 2 && (
              <polyline
                fill="none"
                stroke="var(--barn-slate)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={h2Coords.join(' ')}
              />
            )}

            {cohorts.map((c, i) => {
              const x = xAt(i);
              return (
                <g key={c.year}>
                  <circle cx={x} cy={yFe(c.meanEffectiveFoundersFe)} r="3.5" fill="var(--barn-sage)" />
                  <circle cx={x} cy={yCoi(c.meanCoiPercent)} r="3" fill="var(--barn-terracotta)" />
                  {c.cumulativeWeightH2 !== null && (
                    <rect
                      x={x - 3}
                      y={yH2(c.cumulativeWeightH2) - 3}
                      width="6"
                      height="6"
                      rx="1"
                      fill="var(--barn-slate)"
                    />
                  )}
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--barn-muted)"
                    className="font-mono"
                  >
                    {c.year}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-[var(--barn-border)]/70 text-[11px] text-[var(--barn-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--barn-sage)] inline-block" />
              Mean Effective Founders (<span className="font-mono">fe</span>, left axis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[var(--barn-terracotta)] border-b border-dashed inline-block" />
              Mean Wright COI % (right axis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--barn-slate)] inline-block" />
              Cumulative Weight <span className="font-mono">h²</span> (0.00–1.00 normalized)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--barn-subtle)] text-[var(--barn-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Birth Year</th>
                <th className="px-3 py-2 font-medium text-right">Stock</th>
                <th className="px-3 py-2 font-medium text-right">Mean fe</th>
                <th className="px-3 py-2 font-medium text-right">Mean COI</th>
                <th className="px-3 py-2 font-medium text-right">3-Gen Known</th>
                <th className="px-3 py-2 font-medium text-right">Cumulative Weight h²</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--barn-border)] font-mono tabular-nums">
              {cohorts.map((c) => (
                <tr key={c.year} className="hover:bg-[var(--barn-subtle)]/50">
                  <td className="px-3 py-2 font-semibold text-[var(--barn-ink)]">{c.year}</td>
                  <td className="px-3 py-2 text-right">{c.animalCount}</td>
                  <td className="px-3 py-2 text-right">
                    {c.meanEffectiveFoundersFe > 0 ? c.meanEffectiveFoundersFe.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">{c.meanCoiPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-right">{Math.round(c.meanKnownLineagePercent)}%</td>
                  <td className="px-3 py-2 text-right">
                    {c.cumulativeWeightH2 !== null
                      ? `${c.cumulativeWeightH2.toFixed(2)} (n=${c.weightPairCount})`
                      : 'Insufficient'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (mode === 'pedigree' && subject && subjectAnalysis) {
    const rows =
      ancestorScope === 'founders'
        ? subjectAnalysis.founders
        : subjectAnalysis.topAncestors.slice(0, 16);

    return (
      <section
        aria-label={`${subject.name} Founder Contributions & Species Diversity`}
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
              Founder Contributions &amp; Genetic Bottleneck Analysis
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Exact path-summed ancestor fractions (0.5^depth) and Lacy effective founders (
              <span className="font-mono">fe = 1 / Σpᵢ²</span>) for{' '}
              <strong className="text-[var(--barn-ink)]">{subject.name}</strong>
            </p>
          </div>

          <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <button
              type="button"
              aria-pressed={ancestorScope === 'founders'}
              onClick={() => setAncestorScope('founders')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                ancestorScope === 'founders'
                  ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                  : 'text-[var(--barn-muted)]'
              }`}
            >
              Founders ({subjectAnalysis.founders.length})
            </button>
            <button
              type="button"
              aria-pressed={ancestorScope === 'all_ancestors'}
              onClick={() => setAncestorScope('all_ancestors')}
              className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                ancestorScope === 'all_ancestors'
                  ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                  : 'text-[var(--barn-muted)]'
              }`}
            >
              Top Ancestors ({subjectAnalysis.topAncestors.length})
            </button>
          </div>
        </div>

        {/* 4-Metric Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Effective Founders (fe)</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {subjectAnalysis.effectiveFoundersFe > 0
                ? subjectAnalysis.effectiveFoundersFe.toFixed(2)
                : '0.00'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              of {subjectAnalysis.knownFounderCount} known founders
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Founder Balance (fe / Nf)</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {Math.round(subjectAnalysis.founderBalanceRatio * 100)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              Top share: {subjectAnalysis.dominantFounderSharePercent.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">Known vs Unknown Lineage</div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {subjectAnalysis.knownLineagePercent.toFixed(1)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {subjectAnalysis.unknownOriginPercent.toFixed(1)}% unrecorded branches
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <div className="text-[11px] text-[var(--barn-muted)]">
              {speciesProfile.name} Founder Loss
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
              {founderLossReport.founderLossPercent.toFixed(0)}%
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {founderLossReport.lostFoundersCount} lost · {founderLossReport.endangeredFoundersCount} endangered
            </div>
          </div>
        </div>

        {/* Ranked Ancestor Contribution Table */}
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--barn-muted)]">
            {subject.name} has no recorded ancestors in the current {speciesProfile.name} herd map,
            so it registers as a base founder (100% own line). Link parents in the tree above to trace
            founder contributions.
          </p>
        ) : (
          <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]/50">
            {rows.map((entry) => {
              const barWidth = Math.min(100, Math.max(2, entry.contributionPercent));
              return (
                <div
                  key={entry.animal.id}
                  className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0 space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {onSelectAnimal ? (
                        <button
                          type="button"
                          onClick={() => onSelectAnimal(entry.animal.id)}
                          className="font-semibold text-[var(--barn-ink)] hover:text-[var(--barn-sage)] underline decoration-dotted underline-offset-2 truncate"
                        >
                          {entry.animal.name}
                        </button>
                      ) : (
                        <span className="font-semibold text-[var(--barn-ink)] truncate">
                          {entry.animal.name}
                        </span>
                      )}
                      {entry.animal.tattoo && (
                        <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                          {entry.animal.tattoo}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--barn-muted)]">
                        {entry.isFounder ? 'Founder' : `Gen ${entry.minDepth}`} ·{' '}
                        {entry.appearances} path{entry.appearances === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--barn-subtle)] overflow-hidden flex">
                      {entry.sireLinePercent > 0 && (
                        <div
                          className="h-full bg-[var(--barn-sage)]"
                          style={{
                            width: `${Math.min(100, (entry.sireLinePercent / Math.max(0.01, entry.contributionPercent)) * barWidth)}%`,
                          }}
                          title={`Sire line: ${entry.sireLinePercent.toFixed(1)}%`}
                        />
                      )}
                      {entry.damLinePercent > 0 && (
                        <div
                          className="h-full bg-[var(--barn-terracotta)]"
                          style={{
                            width: `${Math.min(100, (entry.damLinePercent / Math.max(0.01, entry.contributionPercent)) * barWidth)}%`,
                          }}
                          title={`Dam line: ${entry.damLinePercent.toFixed(1)}%`}
                        />
                      )}
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs tabular-nums shrink-0 space-y-0.5">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {entry.contributionPercent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-[var(--barn-muted)]">
                      ♂ {entry.sireLinePercent.toFixed(1)}% · ♀ {entry.damLinePercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label={`${speciesProfile.name} Heritability & Founder Loss Analytics`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            Heritability (<span className="font-mono">h²</span>) Trends &amp; Founder-Loss Analytics
          </h2>
          <p className="text-xs text-[var(--barn-muted)] mt-0.5">
            Parent–offspring regression <span className="font-mono">h²</span> across recorded weights,
            ADG &amp; litter size, plus {speciesProfile.name.toLowerCase()} founder genome retention.
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] shrink-0">
          <button
            type="button"
            aria-pressed={breedingTab === 'heritability'}
            onClick={() => setBreedingTab('heritability')}
            className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              breedingTab === 'heritability'
                ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                : 'text-[var(--barn-muted)]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            Heritability (h²) Trends
          </button>
          <button
            type="button"
            aria-pressed={breedingTab === 'founder_loss'}
            onClick={() => setBreedingTab('founder_loss')}
            className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              breedingTab === 'founder_loss'
                ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                : 'text-[var(--barn-muted)]'
            }`}
          >
            <Dna className="w-3.5 h-3.5" aria-hidden="true" />
            Founder-Loss Ledger ({founderLossReport.totalFoundersCount})
          </button>
        </div>
      </div>

      {/* Projected Pairing Founder Shift Strip when Sire & Dam selected */}
      {pairingShift && (
        <div className="p-4 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/45 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              Projected Pairing Founder Diversity: {selectedSire?.name} × {selectedDam?.name}
            </div>
            <div className="font-mono text-xs tabular-nums text-[var(--barn-ink)]">
              Offspring fe:{' '}
              <strong>
                {pairingShift.projectedOffspring.effectiveFoundersFe.toFixed(2)}
              </strong>{' '}
              <span
                className={
                  pairingShift.feGainVsMeanParent >= 0
                    ? 'text-[var(--barn-sage)]'
                    : 'text-[var(--barn-terracotta)]'
                }
              >
                ({pairingShift.feGainVsMeanParent >= 0 ? '+' : ''}
                {pairingShift.feGainVsMeanParent.toFixed(2)} vs parent avg)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            <span>
              Shared founders: <strong className="text-[var(--barn-ink)]">{pairingShift.sharedFounderIds.length}</strong>
            </span>
            <span>
              Unique Sire founders: <strong className="text-[var(--barn-ink)]">{pairingShift.uniqueSireFounderIds.length}</strong>
            </span>
            <span>
              Unique Dam founders: <strong className="text-[var(--barn-ink)]">{pairingShift.uniqueDamFounderIds.length}</strong>
            </span>
            <span>
              Projected known lineage:{' '}
              <strong className="text-[var(--barn-ink)]">
                {pairingShift.projectedOffspring.knownLineagePercent.toFixed(1)}%
              </strong>
            </span>
          </div>
        </div>
      )}

      {breedingTab === 'heritability' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {heritabilityReport.traits.map((trait) => {
              const isWeight = trait.traitKey === 'weight_grams';
              const formatStat = (val: number | null) => {
                if (val === null) return '—';
                if (isWeight) return formatWeight(Math.round(val), preferredUnit);
                return `${val.toFixed(2)} ${trait.unitLabel}`;
              };
              return (
                <div
                  key={trait.traitKey}
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">{trait.label}</div>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                      n={trait.pairCount}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-mono text-2xl font-semibold tabular-nums text-[var(--barn-ink)]">
                      {trait.heritabilityH2 !== null
                        ? `h² = ${trait.heritabilityH2.toFixed(2)}`
                        : 'Insufficient'}
                    </div>
                    {trait.rSquared !== null && (
                      <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                        R²={trait.rSquared.toFixed(2)}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    {trait.confidenceNote}
                  </p>

                  {trait.meanOffspringValue !== null && trait.meanParentValue !== null && (
                    <div className="pt-2 border-t border-[var(--barn-border)]/70 flex justify-between gap-2 text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                      <span>Parent μ: {formatStat(trait.meanParentValue)}</span>
                      <span>Offspring μ: {formatStat(trait.meanOffspringValue)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {renderCohortSvgChart()}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Founder Loss Rate</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5 text-[var(--barn-ink)]">
                {founderLossReport.founderLossPercent.toFixed(1)}%
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.lostFoundersCount} of {founderLossReport.totalFoundersCount} lost
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Pooled Active fe</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5">
                {founderLossReport.pooledEffectiveFoundersFe.toFixed(2)}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.activeAnimalsCount} active breeding stock
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Endangered Lines</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-0.5 text-[var(--barn-terracotta)]">
                {founderLossReport.endangeredFoundersCount}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                ≤1 active descendant or &lt;2% pool
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[11px] text-[var(--barn-muted)]">Top Bottleneck Line</div>
              <div className="text-sm font-semibold truncate mt-1">
                {founderLossReport.topBottleneckFounder?.founder.name || 'None'}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                {founderLossReport.topBottleneckFounder
                  ? `${founderLossReport.topBottleneckFounder.meanActiveContributionPercent.toFixed(1)}% active pool share`
                  : 'No active contributions'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              {(
                [
                  ['all', `All (${founderLossReport.totalFoundersCount})`],
                  ['Lost', `Lost (${founderLossReport.lostFoundersCount})`],
                  ['Endangered', `Endangered (${founderLossReport.endangeredFoundersCount})`],
                  [
                    'Active Core',
                    `Active Core (${Math.max(
                      0,
                      founderLossReport.activeFoundersCount - founderLossReport.endangeredFoundersCount
                    )})`,
                  ],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  aria-pressed={founderFilter === tabKey}
                  onClick={() => setFounderFilter(tabKey)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    founderFilter === tabKey
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {founderLossReport.endangeredFoundersCount > 0 && (
              <span className="text-[11px] text-[var(--barn-terracotta)] inline-flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
                Outcross endangered lines to avoid permanent founder loss
              </span>
            )}
          </div>

          {filteredLedger.length === 0 ? (
            <p className="text-xs text-[var(--barn-muted)] py-2">
              No {speciesProfile.name.toLowerCase()} founders match the selected status filter.
            </p>
          ) : (
            <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--barn-subtle)] text-[var(--barn-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Founder</th>
                    <th className="px-3 py-2 font-medium">Pool Status</th>
                    <th className="px-3 py-2 font-medium text-right">Active Desc.</th>
                    <th className="px-3 py-2 font-medium text-right">Mean Active Share</th>
                    <th className="px-3 py-2 font-medium text-right">Max Individual</th>
                    <th className="px-3 py-2 font-medium text-right">Historical</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--barn-border)]">
                  {filteredLedger.map((row) => (
                    <tr key={row.founder.id} className="hover:bg-[var(--barn-subtle)]/50">
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[180px] text-[var(--barn-ink)]">
                            {row.founder.name}
                          </span>
                          {row.founder.tattoo && (
                            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                              {row.founder.tattoo}
                            </span>
                          )}
                          {onSelectAnimal && (
                            <button
                              type="button"
                              onClick={() => onSelectAnimal(row.founder.id)}
                              title={`Inspect ${row.founder.name}`}
                              aria-label={`Inspect ${row.founder.name}`}
                              className="text-[var(--barn-sage)] hover:opacity-80 inline-flex items-center"
                            >
                              <ArrowRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${statusTextColor(row.status)}`}>
                        {row.status}
                        {row.isActiveAnimalItself ? ' · Living' : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.activeDescendantsCount}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.meanActiveContributionPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.maxActiveContributionPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--barn-muted)]">
                        {row.historicalDescendantsCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

<!-- END OF PART 04 OF 16 (5 files) -->
