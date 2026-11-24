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
  Calendar,
  Camera,
  Car,
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
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  MileageLog,
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
import { MileageTaxPanel } from './MileageTaxPanel';
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
  onSaveMileageLog?: (
    draft: Omit<MileageLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteMileageLog?: (id: string) => Promise<void> | void;
  onLoadFullReceiptPhoto?: (entryId: string) => Promise<string | null>;
}

type EconomicsTab = 'ledger' | 'processing' | 'youth' | 'mileage';
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
  onSaveMileageLog,
  onDeleteMileageLog,
  onLoadFullReceiptPhoto,
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
  const [hydratedLightboxReceipt, setHydratedLightboxReceipt] = useState<{
    entryId: string;
    dataUrl: string;
  } | null>(null);
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

  useEffect(() => {
    if (!lightboxEntry || lightboxEntry.receiptPhotoDataUrl || !onLoadFullReceiptPhoto) {
      return;
    }
    if (hydratedLightboxReceipt?.entryId === lightboxEntry.id) {
      return;
    }
    let cancelled = false;
    void onLoadFullReceiptPhoto(lightboxEntry.id).then((resolved) => {
      if (!cancelled && resolved) {
        setHydratedLightboxReceipt({ entryId: lightboxEntry.id, dataUrl: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lightboxEntry, onLoadFullReceiptPhoto, hydratedLightboxReceipt]);
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

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mileage'}
          onClick={() => setActiveTab('mileage')}
          className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'mileage'
              ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
              : 'bg-[var(--barn-surface)] border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
          }`}
        >
          <Car className="w-4 h-4" aria-hidden="true" />
          Mileage &amp; Tax Log ({activeData.mileageLogs.length})
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

      {/* TAB 4: MILEAGE & TAX REPORT LOG */}
      {activeTab === 'mileage' && onSaveMileageLog && onDeleteMileageLog && (
        <MileageTaxPanel
          activeData={activeData}
          settings={settings}
          onSaveMileageLog={onSaveMileageLog}
          onDeleteMileageLog={onDeleteMileageLog}
        />
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
                      : ledgerDraft.receiptPhotoDataUrl || ledgerDraft.receiptPhotoThumbnailDataUrl
                      ? 'Replace Receipt'
                      : 'Attach Receipt Photo'}
                  </button>
                  {(ledgerDraft.receiptPhotoDataUrl || ledgerDraft.receiptPhotoThumbnailDataUrl) && (
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
              lightboxEntry.receiptPhotoDataUrl ||
                (hydratedLightboxReceipt?.entryId === lightboxEntry.id
                  ? hydratedLightboxReceipt.dataUrl
                  : undefined) ||
                lightboxEntry.receiptPhotoThumbnailDataUrl
            ) ? (
              <img
                src={
                  sanitizeSafeRasterImageDataUrl(
                    lightboxEntry.receiptPhotoDataUrl ||
                      (hydratedLightboxReceipt?.entryId === lightboxEntry.id
                        ? hydratedLightboxReceipt.dataUrl
                        : undefined) ||
                      lightboxEntry.receiptPhotoThumbnailDataUrl
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
              <span className="font-semibold">Fair, Showmanship &amp; Service Notes</span>
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
