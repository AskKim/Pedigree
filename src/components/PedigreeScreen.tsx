/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive 3-, 4-, 5-, & 6-Generation Pedigree Tree Explorer (`Pedigree`).
 *
 * Strictly scoped to `activeData.speciesProfile.name`. Features:
 * - 3/4/5/6-gen depth selector
 * - Native two-finger pinch-to-zoom (`touch-action: none`) + pan & +/- zoom controls (25%–200%)
 * - Active-first parent linking with optional "Include Archived" toggle
 * - Optional primary animal photo embedding in exported Evans `.HTM` / PDF pedigrees
 */

import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatCompactCarrierDisclosure } from '../core/carrierGenetics';
import { formatGenotypeArray } from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  Animal,
  AnimalConflictKind,
  BarnSettings,
  doesAnimalNeedAttention,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalArchived,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from '../core/models';
import {
  buildPedigreeBranchViewport,
  buildPedigreeSlots,
  getGen3BranchesWithKnownAncestors,
  getPedigreeCompletenessSummary,
  PedigreeSlot,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import { generateEvansHtmPedigree, PedigreePrintOptions } from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { AnimalEditorModal } from './AnimalEditorModal';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { PedigreePrintNotice } from './PedigreePrintNotice';
import { PrintPreviewModal } from './PrintPreviewModal';

interface PedigreeScreenProps {
  activeData: ActiveSpeciesData;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  selectedSubjectId: string | null;
  generations: 3 | 4 | 5 | 6;
  onSelectSubject: (id: string) => void;
  onChangeGenerations: (gens: 3 | 4 | 5 | 6) => void;
  onOpenAnimalInHerd: (id: string) => void;
  onToggleIncludePhotoOnPedigree: (include: boolean) => void;
  onSaveAnimal: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    linkParentTarget?: { childId: string; asSire: boolean },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => void;
  onIgnoreConflicts?: (animalId: string, kinds: AnimalConflictKind[]) => void;
  onRestoreConflictAlert?: (animalId: string, kinds?: AnimalConflictKind[]) => void;
  onLoadFullPhoto?: (photoId: string) => Promise<string | null>;
  onLoadPedigreeNeighborhood?: (rootIds: string[], maxDepth: number) => Promise<Animal[]>;
  onCheckPedigreeBranchesHaveAncestors?: (
    animalIds: string[]
  ) => Promise<Record<string, boolean>>;
}

const MIN_TREE_ZOOM = 0.2;
const MAX_TREE_ZOOM = 2.0;

function clampTreeZoom(value: number): number {
  return Math.min(MAX_TREE_ZOOM, Math.max(MIN_TREE_ZOOM, value));
}

export function PedigreeScreen({
  activeData,
  allAnimals,
  speciesProfiles,
  settings,
  selectedSubjectId,
  generations,
  onSelectSubject,
  onChangeGenerations,
  onOpenAnimalInHerd,
  onToggleIncludePhotoOnPedigree,
  onSaveAnimal,
  onIgnoreConflicts,
  onRestoreConflictAlert,
  onLoadFullPhoto,
  onLoadPedigreeNeighborhood,
  onCheckPedigreeBranchesHaveAncestors,
}: PedigreeScreenProps) {
  const {
    speciesProfile,
    animals,
    primaryPhotoByAnimalId,
    herdById,
    conflictsByAnimalId,
    coiByAnimalId,
    cages,
  } = activeData;

  const [zoom, setZoom] = useState<number>(1);
  const [expandedGen3Branches, setExpandedGen3Branches] = useState<Set<number>>(() => new Set());
  const [lazyAncestorsById, setLazyAncestorsById] = useState<Map<string, Animal>>(() => new Map());
  const [externalKnownGen4Branches, setExternalKnownGen4Branches] = useState<Set<number>>(
    () => new Set()
  );
  const [loadingGen3Branches, setLoadingGen3Branches] = useState<Set<number>>(() => new Set());
  const [printHydrating, setPrintHydrating] = useState<boolean>(false);
  const [linkingSlot, setLinkingSlot] = useState<PedigreeSlot | null>(null);
  const [includeArchivedInLink, setIncludeArchivedInLink] = useState(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [creatingParentSlot, setCreatingParentSlot] = useState<PedigreeSlot | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [hydratedSubjectPhoto, setHydratedSubjectPhoto] = useState<{
    photoId: string;
    dataUrl: string;
  } | null>(null);
  const [pedigreePrintOptions, setPedigreePrintOptions] = useState<PedigreePrintOptions>({
    showWeights: true,
    showGenotypes: false,
    showBreederFooter: true,
    breederContactLine: '',
  });

  const closeLinkingDialog = useCallback(() => setLinkingSlot(null), []);
  const linkingDialogRef = useAccessibleDialog({
    isOpen: Boolean(linkingSlot),
    onClose: closeLinkingDialog,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null);
  const zoomRef = useRef<number>(zoom);
  const canvasDimsRef = useRef<{ width: number; height: number }>({ width: 960, height: 640 });
  const wheelSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wheelSyncTimerRef.current !== null) {
        window.clearTimeout(wheelSyncTimerRef.current);
      }
    };
  }, []);

  const subject = useMemo(() => {
    if (selectedSubjectId && herdById.has(selectedSubjectId)) {
      return herdById.get(selectedSubjectId)!;
    }
    return animals[0] ?? null;
  }, [selectedSubjectId, herdById, animals]);

  const subjectPrimaryPhoto = subject ? primaryPhotoByAnimalId.get(subject.id) : undefined;

  useEffect(() => {
    if (
      !showPrintModal ||
      !settings.includePhotoOnPedigree ||
      !subjectPrimaryPhoto ||
      subjectPrimaryPhoto.dataUrl ||
      !onLoadFullPhoto
    ) {
      if (!showPrintModal || (hydratedSubjectPhoto && hydratedSubjectPhoto.photoId !== subjectPrimaryPhoto?.id)) {
        setHydratedSubjectPhoto(null);
      }
      return;
    }
    if (hydratedSubjectPhoto?.photoId === subjectPrimaryPhoto.id) return;
    let cancelled = false;
    void onLoadFullPhoto(subjectPrimaryPhoto.id).then((resolved) => {
      if (!cancelled && resolved) {
        setHydratedSubjectPhoto({ photoId: subjectPrimaryPhoto.id, dataUrl: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    showPrintModal,
    settings.includePhotoOnPedigree,
    subjectPrimaryPhoto,
    onLoadFullPhoto,
    hydratedSubjectPhoto,
  ]);

  const [historyIds, setHistoryIds] = useState<string[]>(() =>
    selectedSubjectId ? [selectedSubjectId] : []
  );
  const internalNavIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!subject) {
      setHistoryIds([]);
      return;
    }
    if (internalNavIdRef.current === subject.id) {
      internalNavIdRef.current = null;
      return;
    }
    setHistoryIds([subject.id]);
  }, [subject?.id, speciesProfile.name]);

  const historyAnimals = useMemo(() => {
    const resolved = historyIds
      .map((id) => herdById.get(id))
      .filter((a): a is Animal => Boolean(a));
    if (subject && (resolved.length === 0 || resolved[resolved.length - 1].id !== subject.id)) {
      return [...resolved, subject];
    }
    return resolved;
  }, [historyIds, herdById, subject]);

  const handleSelectRootFromDropdown = (id: string) => {
    internalNavIdRef.current = id;
    setHistoryIds([id]);
    onSelectSubject(id);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  };

  const handleDrillToAnimal = (id: string) => {
    if (subject && id === subject.id) return;
    const base = historyIds.filter((entry) => herdById.has(entry));
    const currentTrail =
      subject && base[base.length - 1] !== subject.id ? [...base, subject.id] : base;
    const nextHistory =
      currentTrail.length > 0 && id === currentTrail[0] ? [id] : [...currentTrail, id];
    internalNavIdRef.current = id;
    setHistoryIds(nextHistory);
    onSelectSubject(id);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  };

  const handleJumpToHistoryIndex = (index: number) => {
    const validIds = historyAnimals.map((a) => a.id);
    if (index < 0 || index >= validIds.length) return;
    const nextHistory = validIds.slice(0, index + 1);
    const targetId = nextHistory[nextHistory.length - 1];
    setHistoryIds(nextHistory);
    if (targetId && targetId !== subject?.id) {
      internalNavIdRef.current = targetId;
      onSelectSubject(targetId);
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = 0;
      }
    }
  };

  // Build an immediate 0..3 generation map so unexpanded Gen 4+ ancestors are never traversed eagerly
  const gen0To3BaseMap = useMemo(() => {
    if (!subject) return herdById;
    if (!onLoadPedigreeNeighborhood) return herdById;
    const map = new Map<string, Animal>();
    const frontier: string[] = [subject.id];
    const visited = new Set<string>();
    for (let depth = 0; depth <= 3 && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (let i = 0; i < frontier.length; i++) {
        const id = frontier[i];
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const rec = herdById.get(id) ?? lazyAncestorsById.get(id);
        if (!rec) continue;
        map.set(rec.id, rec);
        if (depth < 3) {
          if (rec.sireId && !visited.has(rec.sireId)) next.push(rec.sireId);
          if (rec.damId && !visited.has(rec.damId)) next.push(rec.damId);
        }
      }
      frontier.length = 0;
      for (let i = 0; i < next.length; i++) frontier.push(next[i]);
    }
    return map;
  }, [subject, herdById, lazyAncestorsById, onLoadPedigreeNeighborhood]);

  // Scoped pedigree lookup merges Gen 0..3 neighborhood with lazily fetched Gen 4+ / archived records
  const activePedigreeMap = useMemo(() => {
    if (!onLoadPedigreeNeighborhood) return herdById;
    if (lazyAncestorsById.size === 0) return gen0To3BaseMap;
    const merged = new Map<string, Animal>(gen0To3BaseMap);
    lazyAncestorsById.forEach((animal, id) => {
      merged.set(id, herdById.get(id) ?? animal);
    });
    return merged;
  }, [gen0To3BaseMap, lazyAncestorsById, herdById, onLoadPedigreeNeighborhood]);

  // Fetch immediate Gen 0..3 neighborhood & probe whether Gen-3 nodes have deeper SQLite/OPFS ancestors
  useEffect(() => {
    if (!subject) {
      setLazyAncestorsById(new Map());
      setExternalKnownGen4Branches(new Set());
      return;
    }
    let cancelled = false;

    const hydrateImmediateAndProbe = async () => {
      if (onLoadPedigreeNeighborhood) {
        try {
          const rows = await onLoadPedigreeNeighborhood([subject.id], 3);
          if (cancelled) return;
          setLazyAncestorsById((prev) => {
            const next = new Map(prev);
            for (const a of rows) {
              next.set(a.id, a);
            }
            return next;
          });
        } catch {
          // Safe fallback to gen0To3BaseMap
        }
      }

      if (generations >= 4 && onCheckPedigreeBranchesHaveAncestors) {
        const g3Slots = buildPedigreeSlots(subject, gen0To3BaseMap, 3, speciesProfile).filter(
          (sl) => sl.generation === 3 && sl.animal
        );
        const g3Ids = g3Slots.map((sl) => sl.animal!.id);
        if (g3Ids.length === 0) {
          if (!cancelled) setExternalKnownGen4Branches(new Set());
          return;
        }
        try {
          const existsMap = await onCheckPedigreeBranchesHaveAncestors(g3Ids);
          if (cancelled) return;
          const knownSet = new Set<number>();
          for (const sl of g3Slots) {
            if (sl.animal && existsMap[sl.animal.id]) {
              knownSet.add(sl.slotIndex);
            }
          }
          setExternalKnownGen4Branches(knownSet);
        } catch {
          if (!cancelled) setExternalKnownGen4Branches(new Set());
        }
      } else if (!cancelled) {
        setExternalKnownGen4Branches(new Set());
      }
    };

    void hydrateImmediateAndProbe();
    return () => {
      cancelled = true;
    };
  }, [
    subject?.id,
    generations,
    speciesProfile.name,
    animals.length,
    onLoadPedigreeNeighborhood,
    onCheckPedigreeBranchesHaveAncestors,
  ]);

  const slots = useMemo(() => {
    if (!subject) return [];
    return buildPedigreeSlots(subject, activePedigreeMap, generations, speciesProfile);
  }, [subject, activePedigreeMap, generations, speciesProfile]);

  useEffect(() => {
    setExpandedGen3Branches(new Set());
    setLazyAncestorsById(new Map());
    setLoadingGen3Branches(new Set());
  }, [subject?.id, generations, speciesProfile.name]);

  const branchViewport = useMemo(
    () =>
      buildPedigreeBranchViewport(
        slots,
        generations,
        expandedGen3Branches,
        externalKnownGen4Branches
      ),
    [slots, generations, expandedGen3Branches, externalKnownGen4Branches]
  );

  const fetchAndMergeBranchAncestors = useCallback(
    async (branchIndices: number[]) => {
      if (!subject || !onLoadPedigreeNeighborhood || generations < 4 || branchIndices.length === 0) {
        return;
      }
      const targetRoots: string[] = [];
      for (const bIdx of branchIndices) {
        const g3Slot = slots.find((sl) => sl.generation === 3 && sl.slotIndex === bIdx);
        if (g3Slot?.animal?.id) {
          targetRoots.push(g3Slot.animal.id);
        }
      }
      if (targetRoots.length === 0) return;
      setLoadingGen3Branches((prev) => {
        const next = new Set(prev);
        for (const b of branchIndices) next.add(b);
        return next;
      });
      try {
        const fetched = await onLoadPedigreeNeighborhood(
          targetRoots,
          Math.max(1, generations - 3)
        );
        setLazyAncestorsById((prev) => {
          const next = new Map(prev);
          for (const a of fetched) next.set(a.id, a);
          return next;
        });
      } finally {
        setLoadingGen3Branches((prev) => {
          const next = new Set(prev);
          for (const b of branchIndices) next.delete(b);
          return next;
        });
      }
    },
    [subject, onLoadPedigreeNeighborhood, generations, slots]
  );

  const toggleGen3Branch = useCallback(
    (branchIndex: number) => {
      const willExpand = !expandedGen3Branches.has(branchIndex);
      setExpandedGen3Branches((prev) => {
        const next = new Set(prev);
        if (next.has(branchIndex)) {
          next.delete(branchIndex);
        } else {
          next.add(branchIndex);
        }
        return next;
      });
      if (willExpand) {
        void fetchAndMergeBranchAncestors([branchIndex]);
      }
    },
    [expandedGen3Branches, fetchAndMergeBranchAncestors]
  );

  const branchesWithKnownGen4 = useMemo(() => {
    if (generations < 4) return [];
    const combined = new Set<number>(getGen3BranchesWithKnownAncestors(slots));
    externalKnownGen4Branches.forEach((b) => combined.add(b));
    return Array.from(combined).sort((a, b) => a - b);
  }, [slots, generations, externalKnownGen4Branches]);

  const handleExpandBranchesBatch = useCallback(
    (branchIndices: number[]) => {
      setExpandedGen3Branches(new Set(branchIndices));
      void fetchAndMergeBranchAncestors(branchIndices);
    },
    [fetchAndMergeBranchAncestors]
  );

  const handleOpenPrintModal = useCallback(async () => {
    if (!subject) return;
    if (onLoadPedigreeNeighborhood && generations >= 4) {
      setPrintHydrating(true);
      try {
        const fullRows = await onLoadPedigreeNeighborhood([subject.id], generations);
        setLazyAncestorsById((prev) => {
          const next = new Map(prev);
          for (const a of fullRows) next.set(a.id, a);
          return next;
        });
      } finally {
        setPrintHydrating(false);
      }
    }
    setShowPrintModal(true);
  }, [subject, onLoadPedigreeNeighborhood, generations]);

  const coi = subject ? coiByAnimalId.get(subject.id) : null;

  const offspring = useMemo(
    () =>
      subject ? animals.filter((a) => a.sireId === subject.id || a.damId === subject.id) : [],
    [animals, subject]
  );

  // Strictly species-isolated and sex-matching candidate parents when filling an empty slot
  const allSafeLinkCandidates = useMemo(() => {
    if (!linkingSlot || !linkingSlot.childAnimalId) return [];
    const childId = linkingSlot.childAnimalId;
    const wantMale = linkingSlot.expectedSex === 'Male';
    return animals.filter((c) => {
      const sexOk = wantMale ? c.sex === 'Male' : c.sex === 'Female';
      return sexOk && c.id !== childId && !wouldCreateCycle(childId, c.id, herdById);
    });
  }, [linkingSlot, animals, herdById]);

  const archivedLinkCount = useMemo(
    () => allSafeLinkCandidates.filter((c) => isAnimalArchived(c)).length,
    [allSafeLinkCandidates]
  );

  const visibleLinkCandidates = useMemo(() => {
    const base = includeArchivedInLink
      ? allSafeLinkCandidates
      : allSafeLinkCandidates.filter((c) => !isAnimalArchived(c));
    if (!includeArchivedInLink) return base;
    const q = linkSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) =>
      [c.name, c.tattoo, c.breed, c.variety, c.registrationNumber]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [allSafeLinkCandidates, includeArchivedInLink, linkSearchQuery]);

  const applyVisualZoomFrame = useCallback(
    (nextZoomRaw: number, scrollLeft: number, scrollTop: number) => {
      const nextZoom = clampTreeZoom(nextZoomRaw);
      zoomRef.current = nextZoom;

      const dims = canvasDimsRef.current;
      if (sizerRef.current) {
        sizerRef.current.style.width = `${dims.width * nextZoom}px`;
        sizerRef.current.style.height = `${dims.height * nextZoom}px`;
      }
      if (stageRef.current) {
        stageRef.current.style.transform = `scale(${nextZoom})`;
      }
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = Math.max(0, scrollLeft);
        viewportRef.current.scrollTop = Math.max(0, scrollTop);
      }
      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
      }
      return nextZoom;
    },
    []
  );

  const commitZoomToReact = useCallback(() => {
    setZoom(Math.round(zoomRef.current * 1000) / 1000);
  }, []);

  const applyZoomCentered = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number, deferReactSync = false) => {
      const viewport = viewportRef.current;
      const prevZoom = zoomRef.current;
      const nextZoom = clampTreeZoom(nextZoomRaw);
      if (Math.abs(nextZoom - prevZoom) < 0.0005) return;

      if (!viewport) {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      const vpRect = viewport.getBoundingClientRect();
      const sizerRect = sizerRef.current?.getBoundingClientRect();
      const originLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
      const originTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

      const focalVpX = clientX !== undefined ? clientX - vpRect.left : viewport.clientWidth / 2;
      const focalVpY = clientY !== undefined ? clientY - vpRect.top : viewport.clientHeight / 2;

      const contentX = (viewport.scrollLeft + focalVpX - originLeft) / prevZoom;
      const contentY = (viewport.scrollTop + focalVpY - originTop) / prevZoom;

      const targetScrollLeft = originLeft + contentX * nextZoom - focalVpX;
      const targetScrollTop = originTop + contentY * nextZoom - focalVpY;

      applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);

      if (deferReactSync) {
        if (wheelSyncTimerRef.current !== null) {
          window.clearTimeout(wheelSyncTimerRef.current);
        }
        wheelSyncTimerRef.current = window.setTimeout(() => {
          wheelSyncTimerRef.current = null;
          commitZoomToReact();
        }, 120);
      } else {
        commitZoomToReact();
      }
    },
    [applyVisualZoomFrame, commitZoomToReact]
  );

  const hasSubject = Boolean(subject);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !hasSubject) return;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchOriginLeft = 12;
    let pinchOriginTop = 12;
    let pinchContentX = 0;
    let pinchContentY = 0;
    let isPinching = false;
    let pendingPinchFrame: number | null = null;
    let latestTouchMetrics: { dist: number; midClientX: number; midClientY: number } | null = null;

    const getTouchMetrics = (touches: TouchList) => {
      const t0 = touches[0];
      const t1 = touches[1];
      return {
        dist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        midClientX: (t0.clientX + t1.clientX) / 2,
        midClientY: (t0.clientY + t1.clientY) / 2,
      };
    };

    const flushPinchFrame = () => {
      pendingPinchFrame = null;
      if (!isPinching || !latestTouchMetrics || pinchStartDist <= 0) return;

      const { dist, midClientX, midClientY } = latestTouchMetrics;
      const vpRect = viewport.getBoundingClientRect();
      const midVpX = midClientX - vpRect.left;
      const midVpY = midClientY - vpRect.top;

      const nextZoom = clampTreeZoom(pinchStartZoom * (dist / pinchStartDist));
      const targetScrollLeft = pinchOriginLeft + pinchContentX * nextZoom - midVpX;
      const targetScrollTop = pinchOriginTop + pinchContentY * nextZoom - midVpY;

      applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        const metrics = getTouchMetrics(e.touches);
        if (metrics.dist <= 4) return;

        const vpRect = viewport.getBoundingClientRect();
        const sizerRect = sizerRef.current?.getBoundingClientRect();
        pinchOriginLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 12;
        pinchOriginTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 12;

        isPinching = true;
        pinchStartDist = metrics.dist;
        pinchStartZoom = zoomRef.current;

        const midVpX = metrics.midClientX - vpRect.left;
        const midVpY = metrics.midClientY - vpRect.top;
        pinchContentX = (viewport.scrollLeft + midVpX - pinchOriginLeft) / pinchStartZoom;
        pinchContentY = (viewport.scrollTop + midVpY - pinchOriginTop) / pinchStartZoom;
        latestTouchMetrics = metrics;

        if (stageRef.current) {
          stageRef.current.style.willChange = 'transform';
        }
      } else {
        isPinching = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPinching || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      latestTouchMetrics = getTouchMetrics(e.touches);
      if (pendingPinchFrame === null) {
        pendingPinchFrame = window.requestAnimationFrame(flushPinchFrame);
      }
    };

    const finishPinch = (e: TouchEvent) => {
      if (e.touches.length < 2 && isPinching) {
        if (pendingPinchFrame !== null) {
          window.cancelAnimationFrame(pendingPinchFrame);
          flushPinchFrame();
        }
        isPinching = false;
        latestTouchMetrics = null;
        if (stageRef.current) {
          stageRef.current.style.willChange = 'auto';
        }
        commitZoomToReact();
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const clampedDelta = Math.max(-60, Math.min(60, e.deltaY));
      const scaleFactor = Math.exp(-clampedDelta * 0.008);
      applyZoomCentered(zoomRef.current * scaleFactor, e.clientX, e.clientY, true);
    };

    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', finishPinch, { passive: true });
    viewport.addEventListener('touchcancel', finishPinch, { passive: true });
    viewport.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      if (pendingPinchFrame !== null) {
        window.cancelAnimationFrame(pendingPinchFrame);
      }
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', finishPinch);
      viewport.removeEventListener('touchcancel', finishPinch);
      viewport.removeEventListener('wheel', onWheel);
    };
  }, [hasSubject, applyVisualZoomFrame, applyZoomCentered, commitZoomToReact]);

  const prevSubjectIdRef = useRef<string | null>(subject?.id ?? null);
  useEffect(() => {
    const nextId = subject?.id ?? null;
    if (prevSubjectIdRef.current !== nextId) {
      prevSubjectIdRef.current = nextId;
      applyVisualZoomFrame(1, 0, 0);
      setZoom(1);
    }
  }, [subject?.id, applyVisualZoomFrame]);

  const handleFitTreeWidth = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableWidth = Math.max(240, viewport.clientWidth - 24);
    const fit = clampTreeZoom(Math.min(1, availableWidth / canvasDimsRef.current.width));
    applyVisualZoomFrame(fit, 0, 0);
    setZoom(Math.round(fit * 1000) / 1000);
  };

  // Dynamic card dimensions across 3, 4, 5, and 6 generations (memoized before early return)
  const layoutConfig = useMemo(
    () =>
      generations === 6
        ? { colWidth: 174, cardWidth: 150, cardHeight: 44, rowPitch: 50, compact: true }
        : generations === 5
        ? { colWidth: 198, cardWidth: 170, cardHeight: 56, rowPitch: 64, compact: true }
        : generations === 4
        ? { colWidth: 235, cardWidth: 198, cardHeight: 78, rowPitch: 88, compact: false }
        : { colWidth: 265, cardWidth: 222, cardHeight: 90, rowPitch: 108, compact: false },
    [generations]
  );

  const { colWidth, cardWidth, cardHeight, rowPitch, compact } = layoutConfig;
  const branchToggleGutter = generations >= 4 ? 78 : 0;
  const hasAnyExpandedGen4 = generations >= 4 && expandedGen3Branches.size > 0;

  const { nodeCoords, connectorPaths, canvasWidth, canvasHeight } = useMemo(() => {
    const coords = new Map<string, { x: number; y: number; slot: PedigreeSlot }>();
    const paths: Array<{ d: string; isSire: boolean; isKnown: boolean }> = [];
    if (branchViewport.visibleSlots.length === 0) {
      return {
        nodeCoords: coords,
        connectorPaths: paths,
        canvasWidth: 960,
        canvasHeight: 640,
      };
    }

    const slotByKey = new Map<string, PedigreeSlot>();
    for (const sl of branchViewport.visibleSlots) {
      slotByKey.set(`${sl.generation}:${sl.slotIndex}`, sl);
    }

    let computedHeight: number;
    let computedWidth: number;

    if (generations <= 3) {
      const leafCount = 1 << generations;
      computedHeight = Math.max(460, leafCount * rowPitch + 40);
      computedWidth = (generations + 1) * colWidth + 24;

      for (const sl of branchViewport.visibleSlots) {
        const slotsInGen = 1 << sl.generation;
        const x = 16 + sl.generation * colWidth;
        const bandHeight = (computedHeight - 32) / slotsInGen;
        const y = 16 + bandHeight * (sl.slotIndex + 0.5) - cardHeight / 2;
        coords.set(`${sl.generation}:${sl.slotIndex}`, { x, y, slot: sl });
      }
    } else {
      computedWidth = hasAnyExpandedGen4
        ? (generations + 1) * colWidth + branchToggleGutter + 24
        : 4 * colWidth + branchToggleGutter + 32;

      const xForGen = (gen: number) =>
        16 + gen * colWidth + (gen >= 4 ? branchToggleGutter : 0);

      let yCursor = 16;
      const gen3CenterY = new Array<number>(8);
      const subLeafCountPerBranch = 1 << (generations - 3);
      const collapsedBranchBandHeight = Math.max(cardHeight + 18, 68);

      for (let b = 0; b < 8; b++) {
        if (expandedGen3Branches.has(b)) {
          const bandHeight = Math.max(cardHeight + 18, subLeafCountPerBranch * rowPitch);
          for (let g = 4; g <= generations; g++) {
            const slotsPerBranchAtG = 1 << (g - 3);
            const slotBand = bandHeight / slotsPerBranchAtG;
            const baseIdx = b * slotsPerBranchAtG;
            for (let k = 0; k < slotsPerBranchAtG; k++) {
              const slotIdx = baseIdx + k;
              const sl = slotByKey.get(`${g}:${slotIdx}`);
              if (!sl) continue;
              const y = yCursor + slotBand * (k + 0.5) - cardHeight / 2;
              coords.set(`${g}:${slotIdx}`, { x: xForGen(g), y, slot: sl });
            }
          }
          gen3CenterY[b] = yCursor + bandHeight / 2;
          yCursor += bandHeight;
        } else {
          gen3CenterY[b] = yCursor + collapsedBranchBandHeight / 2;
          yCursor += collapsedBranchBandHeight;
        }

        const g3Slot = slotByKey.get(`3:${b}`);
        if (g3Slot) {
          coords.set(`3:${b}`, {
            x: xForGen(3),
            y: gen3CenterY[b] - cardHeight / 2,
            slot: g3Slot,
          });
        }
      }

      const gen2CenterY = new Array<number>(4);
      for (let i = 0; i < 4; i++) {
        gen2CenterY[i] = (gen3CenterY[i * 2] + gen3CenterY[i * 2 + 1]) / 2;
        const sl = slotByKey.get(`2:${i}`);
        if (sl) {
          coords.set(`2:${i}`, {
            x: xForGen(2),
            y: gen2CenterY[i] - cardHeight / 2,
            slot: sl,
          });
        }
      }

      const gen1CenterY = new Array<number>(2);
      for (let i = 0; i < 2; i++) {
        gen1CenterY[i] = (gen2CenterY[i * 2] + gen2CenterY[i * 2 + 1]) / 2;
        const sl = slotByKey.get(`1:${i}`);
        if (sl) {
          coords.set(`1:${i}`, {
            x: xForGen(1),
            y: gen1CenterY[i] - cardHeight / 2,
            slot: sl,
          });
        }
      }

      const rootCenterY = (gen1CenterY[0] + gen1CenterY[1]) / 2;
      const rootSlot = slotByKey.get('0:0');
      if (rootSlot) {
        coords.set('0:0', {
          x: xForGen(0),
          y: rootCenterY - cardHeight / 2,
          slot: rootSlot,
        });
      }

      computedHeight = Math.max(460, yCursor + 24);
    }

    for (let g = 0; g < generations; g++) {
      const count = 1 << g;
      for (let idx = 0; idx < count; idx++) {
        const parentBox = coords.get(`${g}:${idx}`);
        const sireBox = coords.get(`${g + 1}:${idx * 2}`);
        const damBox = coords.get(`${g + 1}:${idx * 2 + 1}`);
        if (!parentBox || !sireBox || !damBox) continue;

        const x1 = parentBox.x + cardWidth;
        const y1 = parentBox.y + cardHeight / 2;

        for (const [target, isSire] of [
          [sireBox, true],
          [damBox, false],
        ] as const) {
          const x2 = target.x;
          const y2 = target.y + cardHeight / 2;
          const cx = (x1 + x2) / 2;
          paths.push({
            d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
            isSire,
            isKnown: Boolean(target.slot.animal),
          });
        }
      }
    }

    return {
      nodeCoords: coords,
      connectorPaths: paths,
      canvasWidth: computedWidth,
      canvasHeight: computedHeight,
    };
  }, [
    branchViewport.visibleSlots,
    expandedGen3Branches,
    hasAnyExpandedGen4,
    branchToggleGutter,
    colWidth,
    cardWidth,
    cardHeight,
    rowPitch,
    generations,
  ]);

  canvasDimsRef.current = { width: canvasWidth, height: canvasHeight };

  useEffect(() => {
    zoomRef.current = zoom;
    if (sizerRef.current) {
      sizerRef.current.style.width = `${canvasWidth * zoom}px`;
      sizerRef.current.style.height = `${canvasHeight * zoom}px`;
    }
    if (stageRef.current) {
      stageRef.current.style.transform = `scale(${zoom})`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, [zoom, generations, canvasWidth, canvasHeight]);

  const handleViewportKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const panStep = 64;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      vp.scrollLeft += panStep;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      vp.scrollLeft = Math.max(0, vp.scrollLeft - panStep);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      vp.scrollTop += panStep;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      vp.scrollTop = Math.max(0, vp.scrollTop - panStep);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoomCentered(zoomRef.current + 0.15);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      applyZoomCentered(zoomRef.current - 0.15);
    } else if (e.key === '0') {
      e.preventDefault();
      applyZoomCentered(1);
    }
  };

  if (!subject) {
    return (
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center text-sm text-[var(--barn-muted)]">
        Add a {speciesProfile.name.toLowerCase()} in the Herd tab to explore multi-generation
        pedigree charts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pedigree Controls Toolbar */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="sr-only" htmlFor="pedigree-subject-select">
                Select {speciesProfile.name} Subject
              </label>
              <select
                id="pedigree-subject-select"
                value={subject.id}
                onChange={(e) => handleSelectRootFromDropdown(e.target.value)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
              >
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.tattoo || 'No ID'}) — {formatSexForSpecies(a.sex, speciesProfile)}
                    {isAnimalArchived(a) ? ' [Archived]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              {(() => {
                const comp = coi ? getPedigreeCompletenessSummary(coi) : null;
                return (
                  <>
                    <div className="text-xs font-mono tabular-nums text-[var(--barn-muted)]">
                      Wright COI:{' '}
                      <strong className="text-[var(--barn-ink)]">
                        {(coi?.coiPercent ?? 0).toFixed(2)}%
                      </strong>{' '}
                      ({coi?.risk.label || 'Outcross'}) · Known 3-Gen: {coi?.knownAncestorsIn3Gen ?? 0}/14
                      {comp ? ` (${comp.percent3Gen}%)` : ''}
                    </div>
                    {comp?.isIncompleteZeroOutcross && (
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        Incomplete pedigree ({comp.known3Gen}/{comp.max3Gen} 3-gen ancestors recorded) — 0.00% reflects missing ancestry.
                      </div>
                    )}
                    {(() => {
                      const subjCarriers = formatCompactCarrierDisclosure(subject, {
                        herdById,
                        includeLineage: true,
                        includeCleared: true,
                      });
                      if (!subjCarriers && !subject.rufusLevel) return null;
                      return (
                        <div className="text-[11px] font-medium text-[var(--barn-terracotta)]">
                          {subject.rufusLevel ? `Rufus: ${subject.rufusLevel}` : ''}
                          {subject.rufusLevel && subjCarriers ? ' · ' : ''}
                          {subjCarriers ? `Carrier Disclosures: ${subjCarriers}` : ''}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              {([3, 4, 5, 6] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={generations === g}
                  onClick={() => onChangeGenerations(g)}
                  className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                    generations === g
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {g} Gen
                </button>
              ))}
            </div>

            {generations >= 5 && (
              <button
                type="button"
                onClick={() => onChangeGenerations(3)}
                title="Switch back to compact 3-generation view to reduce mobile memory load"
                className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-muted)] whitespace-nowrap"
              >
                Use 3-Gen (Lighter)
              </button>
            )}

            <button
              type="button"
              disabled={printHydrating}
              aria-busy={printHydrating}
              onClick={() => void handleOpenPrintModal()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-65"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              {printHydrating ? 'Loading Ancestors...' : 'Export .HTM / Print PDF'}
            </button>
            <PedigreePrintNotice compact />
            <ColorGeneticsNotice compact />
          </div>
        </div>

        {/* Pedigree Subject / Tree Conflict Alert or Retained Soft Warning */}
        {(() => {
          const subjectConflict = conflictsByAnimalId.get(subject.id);
          const treeUniqueConflicts = Array.from(
            new Map(
              slots
                .map((sl) => sl.animal)
                .filter((an): an is Animal => Boolean(an))
                .map((an) => [an.id, conflictsByAnimalId.get(an.id)] as const)
                .filter(([, sum]) => Boolean(sum?.hasAnyConflict))
            ).entries()
          );

          if (!subjectConflict?.hasAnyConflict && treeUniqueConflicts.length === 0) {
            return null;
          }

          const hasUrgent =
            Boolean(subjectConflict?.hasActiveConflict) ||
            treeUniqueConflicts.some(([, sum]) => Boolean(sum?.hasActiveConflict));

          return (
            <div
              role={hasUrgent ? 'alert' : 'status'}
              className={`rounded-xl border px-3.5 py-2.5 text-xs flex flex-wrap items-start justify-between gap-2.5 ${
                hasUrgent
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-terracotta)]/55 text-[var(--barn-ink)]'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {hasUrgent ? (
                  <ShieldAlert
                    className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="w-4 h-4 text-[var(--barn-terracotta)]/85 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold">
                    {subjectConflict?.hasActiveConflict
                      ? `Pedigree Conflict Alert for ${subject.name}`
                      : subjectConflict?.isIgnoredWithSoftWarning
                      ? `Soft Warning (Conflict Ignored) — ${subject.name}`
                      : `Pedigree Tree Notices (${treeUniqueConflicts.length} conflicted ancestor${treeUniqueConflicts.length === 1 ? '' : 's'})`}
                  </div>
                  {subjectConflict?.hasAnyConflict ? (
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      {subjectConflict.headlineReasons.join(' · ')}
                      {subjectConflict.isIgnoredWithSoftWarning
                        ? ' (Alert ignored; soft warning stays visible until resolved.)'
                        : ''}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Highlighted cards in this chart have duplicate IDs/tattoos or parent sex mismatches.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenAnimalInHerd(subject.id)}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Open Profile in Herd
                </button>
                {subjectConflict?.hasActiveConflict && onIgnoreConflicts && (
                  <button
                    type="button"
                    onClick={() => onIgnoreConflicts(subject.id, subjectConflict.activeKinds)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                  >
                    Ignore Conflict
                  </button>
                )}
                {subjectConflict?.isIgnoredWithSoftWarning && onRestoreConflictAlert && (
                  <button
                    type="button"
                    onClick={() => onRestoreConflictAlert(subject.id)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Re-enable Alert
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--barn-muted)] border-t border-[var(--barn-border)] pt-2.5">
          <span>
            Pinch with two fingers to zoom (20%–200%), drag to pan, and swipe edges to scroll page
          </span>
          {subjectPrimaryPhoto && (
            <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--barn-ink)] font-medium">
              <input
                type="checkbox"
                checked={Boolean(settings.includePhotoOnPedigree)}
                onChange={(e) => onToggleIncludePhotoOnPedigree(e.target.checked)}
              />
              <span>Include primary photo on .HTM / PDF export</span>
            </label>
          )}
        </div>
      </div>

      {/* Scrollable Pinch-to-Zoom & Pan Bezier Pedigree Canvas */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden">
        <div className="px-3 sm:px-4 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/55 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-[var(--barn-muted)] truncate">
              {subject.name} · {generations}-Gen
            </span>
            {generations >= 4 && (
              <>
                <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                  ({branchViewport.visibleSlotsCount}/{branchViewport.totalSlotsCount} cards rendered
                  {branchViewport.hiddenKnownAncestorsCount > 0
                    ? ` · ${branchViewport.hiddenKnownAncestorsCount} hidden known`
                    : ''}
                  )
                </span>
                {branchesWithKnownGen4.length > 0 && expandedGen3Branches.size < branchesWithKnownGen4.length && (
                  <button
                    type="button"
                    onClick={() => handleExpandBranchesBatch(branchesWithKnownGen4)}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)]/55 bg-[var(--barn-sage-tint)] text-[11px] font-semibold text-[var(--barn-ink)] hover:opacity-90 whitespace-nowrap"
                  >
                    Expand Known Gen 4+ ({branchesWithKnownGen4.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (expandedGen3Branches.size === 8) {
                      setExpandedGen3Branches(new Set());
                    } else {
                      handleExpandBranchesBatch([0, 1, 2, 3, 4, 5, 6, 7]);
                    }
                  }}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                >
                  {expandedGen3Branches.size === 8 ? 'Collapse Gen 4+' : 'Expand All Gen 4+'}
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleFitTreeWidth}
              className="min-h-[34px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => applyZoomCentered(zoomRef.current - 0.15)}
              aria-label="Zoom out pedigree"
              className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              ref={zoomLabelRef}
              onClick={() => applyZoomCentered(1)}
              title="Reset zoom to 100%"
              className="min-h-[34px] px-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-mono tabular-nums hover:bg-[var(--barn-subtle)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => applyZoomCentered(zoomRef.current + 0.15)}
              aria-label="Zoom in pedigree"
              className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          tabIndex={0}
          role="region"
          aria-label={`${subject.name} ${generations}-generation pedigree chart (use arrow keys to pan, +/- to zoom, 0 to reset)`}
          onKeyDown={handleViewportKeyDown}
          style={{
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'auto',
            overflowAnchor: 'none',
          }}
          className="h-[56dvh] min-h-[300px] sm:h-[66vh] sm:min-h-[420px] overflow-auto p-3 sm:p-4"
        >
          <div
            ref={sizerRef}
            style={{
              width: `${canvasWidth * zoom}px`,
              height: `${canvasHeight * zoom}px`,
            }}
            className="relative"
          >
            <div
              ref={stageRef}
              style={{
                width: `${canvasWidth}px`,
                height: `${canvasHeight}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
              className="relative"
            >
            <svg
              width={canvasWidth}
              height={canvasHeight}
              className="absolute inset-0 pointer-events-none"
            >
              {connectorPaths.map((cp, idx) => (
                <path
                  key={idx}
                  d={cp.d}
                  fill="none"
                  stroke={
                    cp.isKnown
                      ? cp.isSire
                        ? 'var(--barn-slate)'
                        : 'var(--barn-terracotta)'
                      : 'currentColor'
                  }
                  className={
                    cp.isKnown
                      ? undefined
                      : 'text-[var(--barn-border)] dark:text-[var(--barn-muted)]/70'
                  }
                  strokeDasharray={cp.isKnown ? undefined : '4 4'}
                  strokeWidth={cp.isKnown ? (compact ? '1.5' : '2') : '1.4'}
                />
              ))}
            </svg>

            {Array.from(nodeCoords.values()).map(({ x, y, slot }) => {
              const a = slot.animal;
              const isSubject = slot.generation === 0;
              const isLinebred = slot.occurrenceCount > 1;
              const isMaleSlot = slot.expectedSex === 'Male';
              const canLinkMissing = !a && Boolean(slot.childAnimalId);
              const nodeConflict = a ? conflictsByAnimalId.get(a.id) : undefined;
              const hasUrgentConflict = Boolean(nodeConflict?.hasActiveConflict);
              const hasSoftConflict = Boolean(nodeConflict?.isIgnoredWithSoftWarning);

              return (
                <div
                  key={`${slot.generation}:${slot.slotIndex}`}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                  }}
                  className={`absolute rounded-xl border ${
                    compact ? 'px-2 py-1' : 'px-3 py-2'
                  } flex flex-col justify-between transition-colors ${
                    a
                      ? hasUrgentConflict
                        ? 'bg-[var(--barn-terracotta-tint)]/75 border-[var(--barn-terracotta)] border-[1.5px]'
                        : hasSoftConflict
                        ? 'bg-[var(--barn-canvas)] border-[var(--barn-terracotta)]/70 border-dashed border-[1.5px]'
                        : isSubject || isLinebred
                        ? 'bg-[var(--barn-sage-tint)]/75 border-[var(--barn-sage)] border-[1.5px]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                      : 'bg-[var(--barn-canvas)]/65 dark:bg-[var(--barn-subtle)]/75 border-dashed border-[var(--barn-border)] dark:border-[var(--barn-muted)]/60'
                  }`}
                >
                  {a ? (() => {
                    const fullCarrier = formatCompactCarrierDisclosure(a, {
                      herdById,
                      includeCleared: true,
                    });
                    const cardCarrier = formatCompactCarrierDisclosure(a, {
                      herdById,
                      includeCleared: true,
                      ultraCompact: compact,
                      maxItemsPerGroup: compact ? 2 : 3,
                    });
                    return (
                      <>
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <button
                            type="button"
                            onClick={() =>
                              slot.generation === 0
                                ? onOpenAnimalInHerd(a.id)
                                : handleDrillToAnimal(a.id)
                            }
                            onFocus={(e) =>
                              e.currentTarget.scrollIntoView?.({
                                block: 'nearest',
                                inline: 'nearest',
                              })
                            }
                            className={`font-semibold text-left truncate hover:underline rounded focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] ${
                              compact ? 'text-[10.5px] leading-tight' : 'text-xs'
                            }`}
                            title={
                              nodeConflict?.hasAnyConflict
                                ? `${a.name} — ${nodeConflict.headlineReasons.join('; ')}`
                                : `${a.name} — click to focus`
                            }
                          >
                            {a.name}
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {nodeConflict?.hasAnyConflict && (
                              <span
                                title={nodeConflict.headlineReasons.join('; ')}
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[var(--barn-terracotta)]"
                              >
                                <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                                {!compact && (hasUrgentConflict ? 'Conflict' : 'Soft Warn')}
                              </span>
                            )}
                            {isLinebred && (
                              <span className="font-mono text-[9.5px] font-semibold text-[var(--barn-sage)]">
                                {slot.occurrenceCount}×
                              </span>
                            )}
                          </div>
                        </div>

                        {!compact ? (
                          <>
                            <div className="text-[11px] text-[var(--barn-muted)] font-mono truncate">
                              {a.tattoo || 'No ID'} · {a.variety || a.breed}
                              {a.weightGrams > 0
                                ? ` · ${formatWeight(a.weightGrams, resolveSpeciesWeightUnit(speciesProfile, settings))}`
                                : ''}
                            </div>

                            {cardCarrier && (
                              <div
                                title={fullCarrier}
                                className="text-[10px] font-medium text-[var(--barn-terracotta)] truncate leading-tight"
                              >
                                {cardCarrier}
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--barn-muted)] truncate">
                              <span
                                className={
                                  a.sex === 'Male'
                                    ? 'text-[var(--barn-slate)] font-medium'
                                    : 'text-[var(--barn-terracotta)] font-medium'
                                }
                              >
                                {formatSexForSpecies(a.sex, speciesProfile)}
                              </span>
                              <span className="font-mono truncate">
                                {a.genotypeRaw ||
                                  formatGenotypeArray(a.genotype) ||
                                  a.registrationNumber}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[9.5px] text-[var(--barn-muted)] font-mono truncate leading-tight">
                              {a.tattoo || formatSexForSpecies(a.sex, speciesProfile)}
                              {generations === 5 && (a.variety || a.breed)
                                ? ` · ${a.variety || a.breed}`
                                : ''}
                            </div>
                            {cardCarrier && (
                              <div
                                title={fullCarrier}
                                className="text-[8.5px] font-medium text-[var(--barn-terracotta)] truncate leading-none"
                              >
                                {cardCarrier}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })() : (
                    <div
                      className={`h-full flex items-center justify-between gap-1.5 text-[var(--barn-muted)] dark:text-[var(--barn-ink)]/85 ${
                        compact ? 'text-[10px]' : 'text-xs'
                      }`}
                    >
                      <span className="truncate font-medium">
                        {compact ? 'Unknown' : `Unknown ${isMaleSlot ? speciesProfile.maleLabel : speciesProfile.femaleLabel}`}
                      </span>
                      {canLinkMissing && (
                        <button
                          type="button"
                          onClick={() => {
                            setIncludeArchivedInLink(false);
                            setLinkSearchQuery('');
                            setLinkingSlot(slot);
                          }}
                          onFocus={(e) =>
                            e.currentTarget.scrollIntoView?.({
                              block: 'nearest',
                              inline: 'nearest',
                            })
                          }
                          aria-label={`Link missing ${
                            isMaleSlot ? speciesProfile.maleLabel : speciesProfile.femaleLabel
                          } for slot ${slot.generation}-${slot.slotIndex + 1}`}
                          className={`rounded-md border border-[var(--barn-border)] dark:border-[var(--barn-muted)]/60 bg-[var(--barn-surface)] dark:bg-[var(--barn-canvas)] font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] inline-flex items-center gap-0.5 shrink-0 ${
                            compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'min-h-[30px] px-2 py-1 text-[11px]'
                          }`}
                        >
                          <Plus className="w-2.5 h-2.5" aria-hidden="true" />
                          Link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {generations >= 4 &&
              Array.from(branchViewport.branchSummaries.values()).map((summary) => {
                const g3Box = nodeCoords.get(summary.slotKey);
                if (!g3Box) return null;
                const btnLeft = g3Box.x + cardWidth + 8;
                const btnTop = g3Box.y + cardHeight / 2 - 14;
                const g3Name = g3Box.slot.animal?.name || g3Box.slot.roleLabel;
                const isBranchLoading = loadingGen3Branches.has(summary.branchIndex);
                return (
                  <button
                    key={`branch-toggle-${summary.branchIndex}`}
                    type="button"
                    aria-expanded={summary.isExpanded}
                    aria-busy={isBranchLoading}
                    onClick={() => toggleGen3Branch(summary.branchIndex)}
                    onFocus={(e) =>
                      e.currentTarget.scrollIntoView?.({
                        block: 'nearest',
                        inline: 'nearest',
                      })
                    }
                    title={
                      summary.isExpanded
                        ? `Collapse Gen 4–${generations} ancestors behind ${g3Name}`
                        : summary.hasKnownAncestors
                        ? `Expand Gen 4–${generations} ancestors behind ${g3Name}`
                        : `Expand Gen 4–${generations} slots behind ${g3Name} (${summary.hiddenTotalSlots} slots)`
                    }
                    aria-label={
                      summary.isExpanded
                        ? `Collapse generation 4 plus ancestors for ${g3Name}`
                        : `Expand generation 4 plus ancestors for ${g3Name}${
                            summary.hasKnownAncestors ? ': known ancestors' : ''
                          }`
                    }
                    style={{
                      left: `${btnLeft}px`,
                      top: `${btnTop}px`,
                    }}
                    className={`absolute h-[28px] px-2 rounded-lg border text-[10px] font-semibold font-mono whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--barn-sage)] ${
                      summary.isExpanded
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent'
                        : summary.hasKnownAncestors
                        ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] border-[var(--barn-sage)] hover:opacity-90'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-muted)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {isBranchLoading
                      ? 'Loading...'
                      : summary.isExpanded
                      ? 'Hide −'
                      : summary.hiddenKnownAncestors > 0
                      ? `+${summary.hiddenKnownAncestors} known`
                      : summary.hasKnownAncestors
                      ? '+ Gen 4+'
                      : `+${summary.hiddenTotalSlots}`}
                  </button>
                );
              })}
          </div>
        </div>
        </div>
      </div>

      {/* Pedigree Navigation Breadcrumb Below Preview */}
      {historyAnimals.length > 1 && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => handleJumpToHistoryIndex(historyAnimals.length - 2)}
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back
          </button>

          <nav
            aria-label="Pedigree trail"
            className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--barn-muted)] min-w-0"
          >
            {historyAnimals.map((entry, idx) => {
              const isLast = idx === historyAnimals.length - 1;
              return (
                <React.Fragment key={`${entry.id}-${idx}`}>
                  {idx > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" aria-hidden="true" />
                  )}
                  {isLast ? (
                    <span className="font-semibold text-[var(--barn-ink)] truncate max-w-[180px]">
                      {entry.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleJumpToHistoryIndex(idx)}
                      className={`min-h-[30px] px-2.5 py-1 rounded-lg border transition-colors truncate max-w-[180px] ${
                        idx === 0
                          ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]/50 text-[var(--barn-ink)] font-semibold hover:opacity-90'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-ink)] font-medium hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      {entry.name}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      )}

      {/* Quick Offspring Jump Strip */}
      {offspring.length > 0 && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--barn-muted)]">
            {speciesProfile.offspringLabel} ({offspring.length}):
          </span>
          {offspring.map((kid) => (
            <button
              key={kid.id}
              type="button"
              onClick={() => handleDrillToAnimal(kid.id)}
              className="min-h-[34px] px-3 py-1 rounded-full bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] font-medium whitespace-nowrap hover:opacity-95 transition-opacity"
            >
              {kid.sex === 'Female' ? '♀ ' : kid.sex === 'Male' ? '♂ ' : ''}
              {kid.name} ({kid.tattoo})
            </button>
          ))}
        </div>
      )}

      {/* Link Existing or Create New Parent Modal */}
      {linkingSlot && (
        <div
          ref={linkingDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Assign Parent"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Assign{' '}
              {linkingSlot.expectedSex === 'Male'
                ? `Sire (${speciesProfile.maleLabel})`
                : `Dam (${speciesProfile.femaleLabel})`}
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
              <span>Showing {speciesProfile.name} candidates (active by default)</span>
              {archivedLinkCount > 0 && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--barn-ink)] font-medium">
                  <input
                    type="checkbox"
                    checked={includeArchivedInLink}
                    onChange={(e) => {
                      setIncludeArchivedInLink(e.target.checked);
                      if (!e.target.checked) setLinkSearchQuery('');
                    }}
                  />
                  <span>Include Archived ({archivedLinkCount})</span>
                </label>
              )}
            </div>

            {includeArchivedInLink && (
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search parents"
                  autoFocus
                  placeholder={`Search ${speciesProfile.name} parents by name, ${getSpeciesIdentifierLabels(speciesProfile.name).shortLabel.toLowerCase()}, or breed...`}
                  value={linkSearchQuery}
                  onChange={(e) => setLinkSearchQuery(e.target.value)}
                  className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--barn-sage)]"
                />
              </div>
            )}

            {visibleLinkCandidates.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)]">
                {includeArchivedInLink && linkSearchQuery.trim()
                  ? `No matching ${speciesProfile.name.toLowerCase()} candidates for "${linkSearchQuery.trim()}".`
                  : `No ${includeArchivedInLink ? '' : 'active '}${speciesProfile.name.toLowerCase()} candidates available. ${
                      archivedLinkCount > 0 && !includeArchivedInLink
                        ? 'Toggle Include Archived above or create a new parent below.'
                        : 'Create a new parent record below.'
                    }`}
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {visibleLinkCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => {
                      const child = herdById.get(linkingSlot.childAnimalId);
                      if (child) {
                        const asSire = linkingSlot.expectedSex === 'Male';
                        onSaveAnimal({
                          ...child,
                          sireId: asSire ? cand.id : child.sireId,
                          damId: !asSire ? cand.id : child.damId,
                        });
                      }
                      setLinkingSlot(null);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[var(--barn-subtle)] flex justify-between gap-2"
                  >
                    <span className="font-medium truncate">
                      {cand.name}
                      {isAnimalArchived(cand) ? ' [Archived]' : ''}
                      {doesAnimalNeedAttention(cand) ? ' [Needs Attention]' : ''}
                    </span>
                    <span className="font-mono text-[var(--barn-muted)] shrink-0">
                      {cand.tattoo}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingParentSlot(linkingSlot);
                  setLinkingSlot(null);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                + Create &amp; Link New{' '}
                {linkingSlot.expectedSex === 'Male'
                  ? speciesProfile.maleLabel
                  : speciesProfile.femaleLabel}
              </button>
              <button
                type="button"
                onClick={() => setLinkingSlot(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingParentSlot && (
        <AnimalEditorModal
          initialAnimal={null}
          speciesProfile={speciesProfile}
          speciesAnimals={animals}
          speciesCages={cages}
          preferredUnit={resolveSpeciesWeightUnit(speciesProfile, settings)}
          currencyCode={settings.currencyCode}
          optimizationPresetId={settings.imageOptimizationPreset}
          defaultBreederName={settings.breederName}
          defaultOwnerName={settings.barnName}
          forcedSex={creatingParentSlot.expectedSex}
          onSave={(draft, pendingPhotos) =>
            onSaveAnimal(
              draft,
              {
                childId: creatingParentSlot.childAnimalId,
                asSire: creatingParentSlot.expectedSex === 'Male',
              },
              pendingPhotos
            )
          }
          onClose={() => setCreatingParentSlot(null)}
        />
      )}

      {showPrintModal && (
        <PrintPreviewModal
          title={`${generations}-Generation Pedigree — ${subject.name}`}
          filename={`pedigree-${subject.tattoo || subject.id}-${generations}gen.htm`}
          htmlContent={generateEvansHtmPedigree(
            subject,
            Array.from(
              new Map<string, Animal>([
                ...Array.from(lazyAncestorsById.entries()),
                ...allAnimals.map((a): [string, Animal] => [a.id, a]),
              ]).values()
            ),
            speciesProfiles,
            settings,
            generations,
            settings.includePhotoOnPedigree
              ? subjectPrimaryPhoto?.dataUrl ||
                  (hydratedSubjectPhoto &&
                  hydratedSubjectPhoto.photoId === subjectPrimaryPhoto?.id
                    ? hydratedSubjectPhoto.dataUrl
                    : subjectPrimaryPhoto?.thumbnailDataUrl)
              : undefined,
            pedigreePrintOptions
          )}
          includePrimaryPhoto={settings.includePhotoOnPedigree}
          onToggleIncludePrimaryPhoto={onToggleIncludePhotoOnPedigree}
          pedigreePrintOptions={pedigreePrintOptions}
          onChangePedigreePrintOptions={setPedigreePrintOptions}
          headerNotice={<PedigreePrintNotice />}
          onClose={() => {
            setShowPrintModal(false);
            setHydratedSubjectPhoto(null);
          }}
        />
      )}
    </div>
  );
}
