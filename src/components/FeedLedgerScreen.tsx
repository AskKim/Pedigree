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
  onLoadFullTagPhoto?: (batchId: string) => Promise<string | null>;
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
  onLoadFullTagPhoto,
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
  const [hydratedLightboxTagPhoto, setHydratedLightboxTagPhoto] = useState<{
    batchId: string;
    dataUrl: string;
  } | null>(null);

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
    setHydratedLightboxTagPhoto(null);
    setConfirmDeleteBatchId(null);
    setConfirmDeleteAllocId(null);
    setRecallEditBatchId(null);
    setAllocBatchId('');
    setAllocTargetId('');
    setLotTraceQuery('');
  }, [speciesProfile.name]);

  useEffect(() => {
    if (!lightboxBatch || lightboxBatch.tagPhotoDataUrl || !onLoadFullTagPhoto) {
      return;
    }
    if (hydratedLightboxTagPhoto?.batchId === lightboxBatch.id) {
      return;
    }
    let cancelled = false;
    void onLoadFullTagPhoto(lightboxBatch.id).then((resolved) => {
      if (!cancelled && resolved) {
        setHydratedLightboxTagPhoto({ batchId: lightboxBatch.id, dataUrl: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lightboxBatch, onLoadFullTagPhoto, hydratedLightboxTagPhoto]);

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
                    {batchDraft.tagPhotoDataUrl || batchDraft.tagPhotoThumbnailDataUrl
                      ? 'Rescan Tag Photo'
                      : 'Scan / Upload Tag'}
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
                src={
                  lightboxBatch.tagPhotoDataUrl ||
                  (hydratedLightboxTagPhoto?.batchId === lightboxBatch.id
                    ? hydratedLightboxTagPhoto.dataUrl
                    : undefined) ||
                  lightboxBatch.tagPhotoThumbnailDataUrl
                }
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
