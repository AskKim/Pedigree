/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Per-Animal Multi-Photo Gallery, Live Optimizer & Lightbox (`src/components/AnimalPhotoGallery.tsx`).
 *
 * Directly optimizes end-user camera/file uploads through `optimizeImageFile` using the barn's
 * active compression preset, displays real-time byte savings, supports multiple photos per animal,
 * cover/primary photo selection, captions, and full-screen inspection.
 */

import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import {
  MAX_PHOTO_BATCH_COUNT,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { Animal, AnimalPhoto } from '../core/models';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface AnimalPhotoGalleryProps {
  animal: Animal;
  photos: AnimalPhoto[];
  optimizationPresetId?: ImageOptimizationPresetId;
  onLoadFullPhoto?: (photoId: string) => Promise<string | null>;
  onAddPhotos: (
    payloads: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<void> | void;
  onSetPrimary: (photoId: string) => Promise<void> | void;
  onUpdateCaption: (photoId: string, caption: string) => Promise<void> | void;
  onDeletePhoto: (photoId: string) => Promise<void> | void;
}

export function AnimalPhotoGallery({
  animal,
  photos,
  optimizationPresetId,
  onLoadFullPhoto,
  onAddPhotos,
  onSetPrimary,
  onUpdateCaption,
  onDeletePhoto,
}: AnimalPhotoGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizeStatus, setOptimizeStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);
  const [captionDraft, setCaptionDraft] = useState<string>('');
  const [captionSavedPulse, setCaptionSavedPulse] = useState<boolean>(false);
  const [showPrimaryPrompt, setShowPrimaryPrompt] = useState<boolean>(false);
  const [hydratedUrls, setHydratedUrls] = useState<Record<string, string>>({});
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);

  const preset = resolveImageOptimizationPreset(optimizationPresetId);

  const activePhoto: AnimalPhoto | null =
    photos.find((p) => p.id === selectedPhotoId) || photos[0] || null;
  const activeIndex = activePhoto ? photos.findIndex((p) => p.id === activePhoto.id) : -1;
  const activePhotoSrc = activePhoto
    ? activePhoto.dataUrl || hydratedUrls[activePhoto.id] || activePhoto.thumbnailDataUrl
    : '';

  const lightboxDialogRef = useAccessibleDialog({
    isOpen: Boolean(lightboxOpen && activePhoto),
    onClose: () => setLightboxOpen(false),
  });

  const captionPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (captionPulseTimerRef.current !== null) {
        clearTimeout(captionPulseTimerRef.current);
      }
    };
  }, []);

  // Clear per-animal resolved full-res image URLs when switching animals
  useEffect(() => {
    setHydratedUrls({});
    setLoadingPhotoId(null);
  }, [animal.id]);

  // Lazily fetch full-resolution dataUrl from SQLite when viewing a dehydrated photo
  useEffect(() => {
    if (!activePhoto || activePhoto.dataUrl || hydratedUrls[activePhoto.id] || !onLoadFullPhoto) {
      return;
    }
    let cancelled = false;
    const targetId = activePhoto.id;
    setLoadingPhotoId(targetId);
    void onLoadFullPhoto(targetId)
      .then((resolved) => {
        if (cancelled || !resolved) return;
        setHydratedUrls((prev) => {
          if (prev[targetId] === resolved) return prev;
          const entries = Object.entries(prev).filter(([k]) => k !== targetId);
          // Keep local component state bounded even on large multi-photo galleries
          const trimmed = entries.slice(-7);
          return Object.fromEntries([...trimmed, [targetId, resolved]]);
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPhotoId((curr) => (curr === targetId ? null : curr));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePhoto, hydratedUrls, onLoadFullPhoto]);

  // Reset active selection and caption draft when switching animals or active photo
  useEffect(() => {
    setConfirmDeleteId(null);
    setUploadError(null);
    if (photos.length > 0 && (!selectedPhotoId || !photos.some((p) => p.id === selectedPhotoId))) {
      setSelectedPhotoId(photos[0].id);
    } else if (photos.length === 0) {
      setSelectedPhotoId(null);
    }
  }, [animal.id, photos, selectedPhotoId]);

  useEffect(() => {
    setCaptionDraft(activePhoto?.caption || '');
  }, [activePhoto?.id, activePhoto?.caption]);

  // Arrow-key navigation when Lightbox is open (Escape + focus trap handled by useAccessibleDialog)
  useEffect(() => {
    if (!lightboxOpen || photos.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = photos[(activeIndex + 1) % photos.length];
        if (next) setSelectedPhotoId(next.id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
        if (prev) setSelectedPhotoId(prev.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, photos, activeIndex]);

  const totalOrigBytes = photos.reduce((acc, p) => acc + (p.originalBytes || 0), 0);
  const totalStoredBytes = photos.reduce((acc, p) => acc + (p.storedBytes || 0), 0);
  const totalSavingsPct = calculateSavingsPercent(totalOrigBytes, totalStoredBytes);

  const processFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i.test(f.name)
    );
    if (files.length === 0) {
      setUploadError('Please choose one or more image files (JPG, PNG, WebP, AVIF, GIF).');
      return;
    }
    if (files.length > MAX_PHOTO_BATCH_COUNT) {
      setUploadError(
        `Selected ${files.length} images. To protect mobile browser memory, please add up to ${MAX_PHOTO_BATCH_COUNT} photos per batch.`
      );
      return;
    }

    for (const file of files) {
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        MAX_PHOTO_UPLOAD_BYTES,
        'a photo upload'
      );
      if (!sizeCheck.ok) {
        setUploadError(sizeCheck.error);
        return;
      }
    }

    setUploadError(null);
    setIsOptimizing(true);
    const optimizedBatch: OptimizedImagePayload[] = [];
    const failedNames: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setOptimizeStatus(`Optimizing ${i + 1} of ${files.length} (${preset.maxDimension}px)...`);
        try {
          const result = await optimizeImageFile(files[i], preset.id);
          optimizedBatch.push(result);
        } catch {
          failedNames.push(files[i].name);
        }
      }

      if (optimizedBatch.length > 0) {
        await onAddPhotos(optimizedBatch);
        if (photos.length + optimizedBatch.length >= 2) {
          setShowPrimaryPrompt(true);
        }
      }
      if (failedNames.length > 0) {
        setUploadError(
          `Could not decode ${failedNames.length} file(s): ${failedNames.slice(0, 3).join(', ')}. Try exporting HEIC/RAW images as JPG or PNG.`
        );
      }
    } finally {
      setIsOptimizing(false);
      setOptimizeStatus('');
    }
  };

  const commitCaptionIfChanged = async () => {
    if (!activePhoto) return;
    const trimmed = captionDraft.trim();
    if (trimmed === activePhoto.caption) return;
    await onUpdateCaption(activePhoto.id, trimmed);
    setCaptionSavedPulse(true);
    if (captionPulseTimerRef.current !== null) {
      clearTimeout(captionPulseTimerRef.current);
    }
    captionPulseTimerRef.current = setTimeout(() => {
      captionPulseTimerRef.current = null;
      setCaptionSavedPulse(false);
    }, 1800);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files?.length) {
          void processFiles(e.dataTransfer.files);
        }
      }}
      className={`space-y-3 border-b border-[var(--barn-border)] pb-5 transition-colors ${
        isDragOver ? 'bg-[var(--barn-sage-tint)]/30 rounded-xl p-3 -mx-3' : ''
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void processFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Section Header & Upload Action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              Animal Photos ({photos.length})
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px] text-[var(--barn-muted)]">
              Auto-Optimize: {preset.maxDimension}px WebP
            </span>
          </div>
          {photos.length > 0 && (
            <p className="text-[11px] text-[var(--barn-muted)] font-mono mt-0.5">
              Stored footprint: {formatByteSizePure(totalStoredBytes)}
              {totalSavingsPct > 0
                ? ` · Saved ${totalSavingsPct}% (from ${formatByteSizePure(totalOrigBytes)})`
                : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={isOptimizing}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
          {isOptimizing ? optimizeStatus || 'Optimizing...' : '+ Add Photos'}
        </button>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
        >
          {uploadError}
        </div>
      )}

      {/* Empty State Dropzone */}
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-4 rounded-xl bg-[var(--barn-canvas)] border border-dashed border-[var(--barn-border)] hover:border-[var(--barn-sage)] transition-colors text-left flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4 text-[var(--barn-muted)]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--barn-ink)]">
                Add 1 or multiple photos for {animal.name}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)] truncate">
                Drop images or tap to browse · Resized &amp; compressed ({preset.typicalSizeHint})
              </div>
            </div>
          </div>
          <Sparkles className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
        </button>
      ) : (
        activePhoto && (
          <div className="space-y-2.5">
            {/* Active Photo Showcase Card */}
            <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] overflow-hidden">
              <div className="relative bg-black/20 flex items-center justify-center max-h-72 overflow-hidden group">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={`Inspect ${activePhoto.caption || `${animal.name} photo`} full size`}
                  className="max-h-72 flex items-center justify-center cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--barn-sage)]"
                >
                  <img
                    src={activePhotoSrc}
                    alt={activePhoto.caption || `${animal.name} photo`}
                    className="max-h-72 w-auto object-contain select-none"
                  />
                </button>
                {loadingPhotoId === activePhoto.id && !activePhoto.dataUrl && !hydratedUrls[activePhoto.id] && (
                  <span
                    role="status"
                    className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium"
                  >
                    Loading full photo...
                  </span>
                )}

                {/* Top-Left Cover Status / Set Primary Action */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  {activePhoto.isPrimary ? (
                    <span className="px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-semibold inline-flex items-center gap-1 backdrop-blur-xs">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      Cover Photo
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onSetPrimary(activePhoto.id)}
                      className="min-h-[28px] px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/85 text-white text-[11px] font-medium inline-flex items-center gap-1 backdrop-blur-xs"
                    >
                      <Star className="w-3 h-3" aria-hidden="true" />
                      Set as Cover
                    </button>
                  )}
                </div>

                {/* Top-Right Fullscreen Zoom Button */}
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="Inspect full size"
                  className="absolute top-2.5 right-2.5 min-h-[30px] min-w-[30px] rounded-lg bg-black/70 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-xs"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                {/* Prev/Next Overlay Arrows when Multiple Photos Exist */}
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
                        if (prev) setSelectedPhotoId(prev.id);
                      }}
                      aria-label="Previous photo"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = photos[(activeIndex + 1) % photos.length];
                        if (next) setSelectedPhotoId(next.id);
                      }}
                      aria-label="Next photo"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Caption Editor + Compression Metadata Bar */}
              <div className="p-2.5 border-t border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    aria-label="Photo caption"
                    placeholder="Add photo caption (e.g. Side profile, Left ear tattoo)..."
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                    onBlur={() => void commitCaptionIfChanged()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  {captionSavedPulse && (
                    <span className="text-[11px] text-[var(--barn-sage)] inline-flex items-center gap-0.5 shrink-0">
                      <Check className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                    {activePhoto.width > 0 ? `${activePhoto.width}×${activePhoto.height} · ` : ''}
                    {formatByteSizePure(activePhoto.storedBytes)}
                    {calculateSavingsPercent(activePhoto.originalBytes, activePhoto.storedBytes) > 0
                      ? ` (-${calculateSavingsPercent(
                          activePhoto.originalBytes,
                          activePhoto.storedBytes
                        )}%)`
                      : ''}
                  </span>

                  {confirmDeleteId === activePhoto.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void onDeletePhoto(activePhoto.id);
                          setConfirmDeleteId(null);
                        }}
                        className="min-h-[28px] px-2 py-0.5 rounded-md bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(activePhoto.id)}
                      aria-label="Delete photo"
                      className="min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Photo Prompt & Quick Selector when 2+ Photos Exist */}
            {photos.length >= 2 && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  showPrimaryPrompt
                    ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                    : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--barn-ink)]">
                      {showPrimaryPrompt
                        ? 'Choose Your Primary Photo (Multiple Photos Uploaded)'
                        : 'Primary Photo for Profile & Printed Pedigree'}
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">
                      Tap any thumbnail below or mark your favorite as Primary so you can print it on
                      official pedigrees.
                    </p>
                  </div>
                  {showPrimaryPrompt && (
                    <button
                      type="button"
                      onClick={() => setShowPrimaryPrompt(false)}
                      className="min-h-[28px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
                    >
                      Done
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {photos.map((p, idx) => {
                    const isCurrent = p.id === activePhoto.id;
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPhotoId(p.id)}
                          className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                            isCurrent
                              ? 'border-[var(--barn-sage)] scale-[1.02]'
                              : 'border-[var(--barn-border)] opacity-75 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={p.thumbnailDataUrl || p.dataUrl}
                            alt={p.caption || `Photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {p.isPrimary && (
                            <span
                              title="Primary photo"
                              className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-black/75 flex items-center justify-center"
                            >
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={p.isPrimary}
                          onClick={() => {
                            void onSetPrimary(p.id);
                            setSelectedPhotoId(p.id);
                            setShowPrimaryPrompt(false);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            p.isPrimary
                              ? 'text-[var(--barn-sage)] font-semibold'
                              : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                          }`}
                        >
                          {p.isPrimary ? 'Primary ★' : 'Set Primary'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Full-Screen Lightbox Modal */}
      {lightboxOpen && activePhoto && (
        <div
          ref={lightboxDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${animal.name} photo viewer`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full flex flex-col items-center gap-3"
          >
            <div className="w-full flex items-center justify-between text-white text-xs px-1">
              <div className="truncate">
                <span className="font-semibold">{animal.name}</span>
                {activePhoto.caption ? ` — ${activePhoto.caption}` : ''}
                <span className="text-white/65 font-mono ml-2">
                  ({activeIndex + 1}/{photos.length} · {activePhoto.width}×{activePhoto.height} ·{' '}
                  {formatByteSizePure(activePhoto.storedBytes)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close photo viewer"
                className="min-h-[36px] min-w-[36px] rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full flex items-center justify-center">
              <img
                src={activePhotoSrc}
                alt={activePhoto.caption || animal.name}
                className="max-h-[78vh] max-w-full rounded-xl object-contain"
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const prev = photos[(activeIndex - 1 + photos.length) % photos.length];
                      if (prev) setSelectedPhotoId(prev.id);
                    }}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = photos[(activeIndex + 1) % photos.length];
                      if (next) setSelectedPhotoId(next.id);
                    }}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
