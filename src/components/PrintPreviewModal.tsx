/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-App Document & Thermal Label Print Preview Modal.
 *
 * Renders generated `.HTM` pedigrees and 4"x2" cage cards inside an isolated `<iframe srcDoc>`
 * with 60/120fps DOM-composited pinch-to-zoom, Ctrl+wheel zoom, and toolbar zoom controls so
 * multi-generation pedigrees can be inspected smoothly before PDF printing (`contentWindow.print()`)
 * or download.
 */

import { Download, Printer, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadTextFile } from '../utils/webFileActions';

const MIN_PREVIEW_ZOOM = 0.35;
const MAX_PREVIEW_ZOOM = 2.5;

function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

interface PrintPreviewModalProps {
  title: string;
  filename: string;
  htmlContent: string;
  includePrimaryPhoto?: boolean;
  onToggleIncludePrimaryPhoto?: (include: boolean) => void;
  onClose: () => void;
}

export function PrintPreviewModal({
  title,
  filename,
  htmlContent,
  includePrimaryPhoto,
  onToggleIncludePrimaryPhoto,
  onClose,
}: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [docSize, setDocSize] = useState<{ width: number; height: number }>({
    width: 980,
    height: 760,
  });

  const zoomRef = useRef<number>(zoom);
  const docSizeRef = useRef(docSize);
  docSizeRef.current = docSize;

  const wheelSyncTimerRef = useRef<number | null>(null);
  const cleanupDocListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (wheelSyncTimerRef.current !== null) {
        window.clearTimeout(wheelSyncTimerRef.current);
      }
      cleanupDocListenersRef.current?.();
      cleanupDocListenersRef.current = null;
    };
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
    if (sizerRef.current) {
      sizerRef.current.style.width = `${docSize.width * zoom}px`;
      sizerRef.current.style.height = `${docSize.height * zoom}px`;
    }
    if (iframeRef.current) {
      iframeRef.current.style.transform = `scale(${zoom})`;
    }
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, [zoom, docSize]);

  const applyVisualZoomFrame = useCallback(
    (nextZoomRaw: number, scrollLeft: number, scrollTop: number) => {
      const nextZoom = clampPreviewZoom(nextZoomRaw);
      zoomRef.current = nextZoom;

      const dims = docSizeRef.current;
      if (sizerRef.current) {
        sizerRef.current.style.width = `${dims.width * nextZoom}px`;
        sizerRef.current.style.height = `${dims.height * nextZoom}px`;
      }
      if (iframeRef.current) {
        iframeRef.current.style.transform = `scale(${nextZoom})`;
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
      const nextZoom = clampPreviewZoom(nextZoomRaw);
      if (Math.abs(nextZoom - prevZoom) < 0.0005) return;

      if (!viewport) {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        return;
      }

      const vpRect = viewport.getBoundingClientRect();
      const sizerRect = sizerRef.current?.getBoundingClientRect();
      const originLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 16;
      const originTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 16;

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

  const attachPinchAndWheelListeners = useCallback(
    (target: HTMLElement | Document, isInsideIframe: boolean) => {
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let pinchOriginLeft = 16;
      let pinchOriginTop = 16;
      let pinchContentX = 0;
      let pinchContentY = 0;
      let isPinching = false;
      let pendingPinchFrame: number | null = null;
      let latestTouchMetrics: { dist: number; midClientX: number; midClientY: number } | null =
        null;

      const toViewportCoords = (clientX: number, clientY: number) => {
        if (!isInsideIframe || !iframeRef.current) {
          return { x: clientX, y: clientY };
        }
        const iframeRect = iframeRef.current.getBoundingClientRect();
        return {
          x: iframeRect.left + clientX * zoomRef.current,
          y: iframeRect.top + clientY * zoomRef.current,
        };
      };

      const getTouchMetrics = (touches: TouchList) => {
        const t0 = touches[0];
        const t1 = touches[1];
        const p0 = toViewportCoords(t0.clientX, t0.clientY);
        const p1 = toViewportCoords(t1.clientX, t1.clientY);
        return {
          dist: Math.hypot(p1.x - p0.x, p1.y - p0.y),
          midClientX: (p0.x + p1.x) / 2,
          midClientY: (p0.y + p1.y) / 2,
        };
      };

      const flushPinchFrame = () => {
        pendingPinchFrame = null;
        const viewport = viewportRef.current;
        if (!viewport || !isPinching || !latestTouchMetrics || pinchStartDist <= 0) return;

        const { dist, midClientX, midClientY } = latestTouchMetrics;
        const vpRect = viewport.getBoundingClientRect();
        const midVpX = midClientX - vpRect.left;
        const midVpY = midClientY - vpRect.top;

        const nextZoom = clampPreviewZoom(pinchStartZoom * (dist / pinchStartDist));
        const targetScrollLeft = pinchOriginLeft + pinchContentX * nextZoom - midVpX;
        const targetScrollTop = pinchOriginTop + pinchContentY * nextZoom - midVpY;

        applyVisualZoomFrame(nextZoom, targetScrollLeft, targetScrollTop);
      };

      const onTouchStart = (e: TouchEvent) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        if (e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
          const metrics = getTouchMetrics(e.touches);
          if (metrics.dist <= 4) return;

          const vpRect = viewport.getBoundingClientRect();
          const sizerRect = sizerRef.current?.getBoundingClientRect();
          pinchOriginLeft = sizerRect ? sizerRect.left - vpRect.left + viewport.scrollLeft : 16;
          pinchOriginTop = sizerRect ? sizerRect.top - vpRect.top + viewport.scrollTop : 16;

          isPinching = true;
          pinchStartDist = metrics.dist;
          pinchStartZoom = zoomRef.current;

          const midVpX = metrics.midClientX - vpRect.left;
          const midVpY = metrics.midClientY - vpRect.top;
          pinchContentX = (viewport.scrollLeft + midVpX - pinchOriginLeft) / pinchStartZoom;
          pinchContentY = (viewport.scrollTop + midVpY - pinchOriginTop) / pinchStartZoom;
          latestTouchMetrics = metrics;

          if (iframeRef.current) {
            iframeRef.current.style.willChange = 'transform';
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
          if (iframeRef.current) {
            iframeRef.current.style.willChange = 'auto';
          }
          commitZoomToReact();
        }
      };

      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const pt = toViewportCoords(e.clientX, e.clientY);
        const clampedDelta = Math.max(-60, Math.min(60, e.deltaY));
        const scaleFactor = Math.exp(-clampedDelta * 0.008);
        applyZoomCentered(zoomRef.current * scaleFactor, pt.x, pt.y, true);
      };

      target.addEventListener('touchstart', onTouchStart as EventListener, { passive: false });
      target.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
      target.addEventListener('touchend', finishPinch as EventListener, { passive: true });
      target.addEventListener('touchcancel', finishPinch as EventListener, { passive: true });
      target.addEventListener('wheel', onWheel as EventListener, { passive: false });

      return () => {
        if (pendingPinchFrame !== null) {
          window.cancelAnimationFrame(pendingPinchFrame);
        }
        target.removeEventListener('touchstart', onTouchStart as EventListener);
        target.removeEventListener('touchmove', onTouchMove as EventListener);
        target.removeEventListener('touchend', finishPinch as EventListener);
        target.removeEventListener('touchcancel', finishPinch as EventListener);
        target.removeEventListener('wheel', onWheel as EventListener);
      };
    },
    [applyVisualZoomFrame, applyZoomCentered, commitZoomToReact]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    return attachPinchAndWheelListeners(viewport, false);
  }, [attachPinchAndWheelListeners]);

  const handleIframeLoad = () => {
    cleanupDocListenersRef.current?.();
    cleanupDocListenersRef.current = null;

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const viewportWidth = viewportRef.current
      ? Math.max(320, viewportRef.current.clientWidth - 32)
      : 960;
    const measuredWidth = Math.max(
      viewportWidth,
      doc.documentElement?.scrollWidth || 0,
      doc.body?.scrollWidth || 0
    );
    const measuredHeight = Math.max(
      640,
      (doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 720) + 24
    );
    setDocSize({ width: measuredWidth, height: measuredHeight });

    if (doc.documentElement) {
      doc.documentElement.style.touchAction = 'pan-x pan-y';
    }
    cleanupDocListenersRef.current = attachPinchAndWheelListeners(doc, true);
  };

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleDownloadHtm = () => {
    downloadTextFile(filename, htmlContent, 'text/html');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--barn-border)]">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onToggleIncludePrimaryPhoto && (
              <label className="min-h-[40px] px-3 py-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(includePrimaryPhoto)}
                  onChange={(e) => onToggleIncludePrimaryPhoto(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Include Primary Photo</span>
              </label>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyZoomCentered(zoom - 0.15)}
                aria-label="Zoom out preview"
                className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                ref={zoomLabelRef}
                onClick={() => applyZoomCentered(1)}
                title="Reset preview zoom to 100%"
                className="min-h-[38px] px-2.5 rounded-lg border border-[var(--barn-border)] text-xs font-mono tabular-nums hover:bg-[var(--barn-subtle)]"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => applyZoomCentered(zoom + 0.15)}
                aria-label="Zoom in preview"
                className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadHtm}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download .HTM
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          style={{
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'contain',
            overflowAnchor: 'none',
          }}
          className="flex-1 bg-neutral-200 dark:bg-neutral-900 p-4 overflow-auto"
        >
          <div
            ref={sizerRef}
            style={{
              width: `${docSize.width * zoom}px`,
              height: `${docSize.height * zoom}px`,
            }}
            className="relative"
          >
            <iframe
              ref={iframeRef}
              title={title}
              srcDoc={htmlContent}
              onLoad={handleIframeLoad}
              style={{
                width: `${docSize.width}px`,
                height: `${docSize.height}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
              className="bg-white rounded-lg border border-neutral-300 shadow-sm block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
