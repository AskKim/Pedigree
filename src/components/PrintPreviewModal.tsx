/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * In-App Document & Thermal Label Print Preview Modal.
 *
 * Renders generated `.HTM` pedigrees and 4"x2" cage cards inside an isolated `<iframe srcDoc>`
 * with 60/120fps DOM-composited pinch-to-zoom, Ctrl+wheel zoom, and toolbar zoom controls so
 * multi-generation pedigrees can be inspected smoothly before PDF printing (`contentWindow.print()`)
 * or download.
 */

import { AlertCircle, Download, Printer, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BarnBinderOptions } from '../core/barnBinder';
import type { PedigreePrintOptions } from '../core/syncAndExports';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { downloadTextFile } from '../utils/webFileActions';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';

const MIN_PREVIEW_ZOOM = 0.2;
const MAX_PREVIEW_ZOOM = 2.5;

function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

interface PrintPreviewModalProps {
  title: string;
  filename: string;
  htmlContent: string;
  headerNotice?: ReactNode;
  includePrimaryPhoto?: boolean;
  onToggleIncludePrimaryPhoto?: (include: boolean) => void;
  pedigreePrintOptions?: PedigreePrintOptions;
  onChangePedigreePrintOptions?: (next: PedigreePrintOptions) => void;
  binderPrintOptions?: BarnBinderOptions;
  onChangeBinderPrintOptions?: (next: BarnBinderOptions) => void;
  binderArchivedCount?: number;
  onClose: () => void;
}

export function PrintPreviewModal({
  title,
  filename,
  htmlContent,
  headerNotice,
  includePrimaryPhoto,
  onToggleIncludePrimaryPhoto,
  pedigreePrintOptions,
  onChangePedigreePrintOptions,
  binderPrintOptions,
  onChangeBinderPrintOptions,
  binderArchivedCount = 0,
  onClose,
}: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sizerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [fitZoom, setFitZoom] = useState<number>(1);
  const [printBlockedMessage, setPrintBlockedMessage] = useState<string | null>(null);
  const [docSize, setDocSize] = useState<{ width: number; height: number }>({
    width: 980,
    height: 760,
  });

  const zoomRef = useRef<number>(zoom);
  const docSizeRef = useRef(docSize);
  docSizeRef.current = docSize;

  const initializedContentRef = useRef<string | null>(null);
  const wheelSyncTimerRef = useRef<number | null>(null);
  const printFallbackTimerRef = useRef<number | null>(null);
  const printSafetyTimerRef = useRef<number | null>(null);
  const cleanupPrintStageRef = useRef<(() => void) | null>(null);
  const cleanupDocListenersRef = useRef<(() => void) | null>(null);
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });

  useEffect(() => {
    return () => {
      if (wheelSyncTimerRef.current !== null) {
        window.clearTimeout(wheelSyncTimerRef.current);
      }
      if (printFallbackTimerRef.current !== null) {
        window.clearTimeout(printFallbackTimerRef.current);
      }
      if (printSafetyTimerRef.current !== null) {
        window.clearTimeout(printSafetyTimerRef.current);
      }
      cleanupPrintStageRef.current?.();
      cleanupPrintStageRef.current = null;
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

  const attachPinchAndWheelListeners = useCallback(
    (target: HTMLElement | Document, isInsideIframe: boolean) => {
      let pinchStartDist = 0;
      let pinchStartZoom = 1;
      let pinchOriginLeft = 12;
      let pinchOriginTop = 12;
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

    const availableWidth = viewportRef.current
      ? Math.max(240, viewportRef.current.clientWidth - 28)
      : 960;
    const measuredWidth = Math.max(
      availableWidth,
      doc.documentElement?.scrollWidth || 0,
      doc.body?.scrollWidth || 0
    );
    const measuredHeight = Math.max(
      640,
      (doc.documentElement?.scrollHeight || doc.body?.scrollHeight || 720) + 24
    );
    setDocSize({ width: measuredWidth, height: measuredHeight });

    const computedFitZoom = clampPreviewZoom(Math.min(1, availableWidth / measuredWidth));
    setFitZoom(computedFitZoom);

    if (initializedContentRef.current !== htmlContent) {
      initializedContentRef.current = htmlContent;
      zoomRef.current = computedFitZoom;
      setZoom(computedFitZoom);
      if (viewportRef.current) {
        viewportRef.current.scrollLeft = 0;
        viewportRef.current.scrollTop = 0;
      }
    }

    if (doc.documentElement) {
      doc.documentElement.style.touchAction = 'pan-x pan-y';
    }
    cleanupDocListenersRef.current = attachPinchAndWheelListeners(doc, true);
  };

  const handleDownloadHtm = () => {
    downloadTextFile(filename, htmlContent, 'text/html');
  };

  const canShareHtml = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return false;
    try {
      const probe = new File(['<html></html>'], filename, { type: 'text/html' });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }, [filename]);

  const handleShareHtm = async () => {
    try {
      const file = new File([htmlContent], filename, { type: 'text/html' });
      await navigator.share({ title, files: [file] });
    } catch {
      handleDownloadHtm();
    }
  };

  const handlePrint = () => {
    setPrintBlockedMessage(null);
    cleanupPrintStageRef.current?.();
    cleanupPrintStageRef.current = null;
    if (printFallbackTimerRef.current !== null) {
      window.clearTimeout(printFallbackTimerRef.current);
      printFallbackTimerRef.current = null;
    }
    if (printSafetyTimerRef.current !== null) {
      window.clearTimeout(printSafetyTimerRef.current);
      printSafetyTimerRef.current = null;
    }

    const parsedFallback = new DOMParser().parseFromString(htmlContent, 'text/html');
    const sourceDoc = iframeRef.current?.contentDocument ?? parsedFallback;
    const bodyHtml = sourceDoc.body?.innerHTML || parsedFallback.body?.innerHTML || '';
    const docTitle = sourceDoc.title || parsedFallback.title || title;

    const pageRules: string[] = [];
    const scopedRules: string[] = [];

    const scopeSelectorList = (selectorText: string) =>
      selectorText
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((sel) => {
          if (/^(html|body)$/i.test(sel)) return '#barn-print-stage';
          if (/^(html|body)\s+/i.test(sel)) {
            return `#barn-print-stage ${sel.replace(/^(html|body)\s+/i, '')}`;
          }
          return `#barn-print-stage ${sel}`;
        })
        .join(', ');

    try {
      const sheets = Array.from(sourceDoc.styleSheets || []);
      for (const sheet of sheets) {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule.type === 6 || rule.cssText.trimStart().startsWith('@page')) {
            pageRules.push(rule.cssText);
          } else if (rule.type === 1) {
            const styleRule = rule as CSSStyleRule;
            const scoped = scopeSelectorList(styleRule.selectorText);
            if (scoped) {
              scopedRules.push(`${scoped} { ${styleRule.style.cssText} }`);
            }
          }
        }
      }
    } catch {
      // Fallback to raw <style> text below
    }

    if (scopedRules.length === 0) {
      const rawCss = Array.from(parsedFallback.querySelectorAll('style'))
        .map((el) => el.textContent || '')
        .join('\n');
      const extractedPages = rawCss.match(/@page\s*\{[^}]*\}/gi) || [];
      pageRules.push(...extractedPages);
      const withoutPage = rawCss.replace(/@page\s*\{[^}]*\}/gi, '');
      const rewritten = withoutPage.replace(/(^|[\s,}])(html|body)(?=[\s,{])/gi, '$1#barn-print-stage');
      scopedRules.push(rewritten);
    }

    const stageEl = document.createElement('div');
    stageEl.id = 'barn-print-stage';
    stageEl.setAttribute('aria-hidden', 'true');
    stageEl.innerHTML = bodyHtml;

    const preserveAccentInk = Boolean(
      sourceDoc.querySelector('meta[name="barn-preserve-accent-ink"][content="true"]') ??
        parsedFallback.querySelector('meta[name="barn-preserve-accent-ink"][content="true"]')
    );

    const styleEl = document.createElement('style');
    styleEl.id = 'barn-print-stage-style';
    styleEl.textContent = `
      ${pageRules.join('\n')}
      @media screen {
        #barn-print-stage { display: none !important; }
      }
      @media print {
        :root, .dark, html, body, #root, #barn-print-stage {
          color-scheme: light only !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          ${preserveAccentInk ? '' : 'color: #000000 !important;'}
          -webkit-print-color-adjust: ${preserveAccentInk ? 'exact' : 'economy'} !important;
          print-color-adjust: ${preserveAccentInk ? 'exact' : 'economy'} !important;
        }
        body > *:not(#barn-print-stage) {
          display: none !important;
        }
        #barn-print-stage {
          display: block !important;
          width: auto !important;
          box-sizing: border-box !important;
        }
        ${scopedRules.join('\n')}
        #barn-print-stage,
        #barn-print-stage div,
        #barn-print-stage section,
        #barn-print-stage article,
        #barn-print-stage figure,
        #barn-print-stage table,
        #barn-print-stage thead,
        #barn-print-stage tbody,
        #barn-print-stage tr,
        #barn-print-stage th,
        #barn-print-stage td {
          background: #ffffff !important;
          background-color: #ffffff !important;
          ${preserveAccentInk ? '' : 'color: #000000 !important;'}
          box-shadow: none !important;
        }
      }
    `;

    const prevTitle = document.title;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (printSafetyTimerRef.current !== null) {
        window.clearTimeout(printSafetyTimerRef.current);
        printSafetyTimerRef.current = null;
      }
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', cleanup);
      styleEl.remove();
      stageEl.remove();
      if (docTitle && document.title === docTitle) {
        document.title = prevTitle;
      }
      if (cleanupPrintStageRef.current === cleanup) {
        cleanupPrintStageRef.current = null;
      }
    };

    let printEventFired = false;
    const onBeforePrint = () => {
      printEventFired = true;
      if (printFallbackTimerRef.current !== null) {
        window.clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
    };

    cleanupPrintStageRef.current = cleanup;
    window.addEventListener('beforeprint', onBeforePrint, { once: true });
    window.addEventListener('afterprint', cleanup, { once: true });

    document.head.appendChild(styleEl);
    document.body.appendChild(stageEl);
    if (docTitle) {
      document.title = docTitle;
    }

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let printThrew = false;
    try {
      window.focus();
      window.print();
    } catch {
      printThrew = true;
    }
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;

    if (printThrew) {
      cleanup();
      setPrintBlockedMessage(
        'This browser or embedded preview blocked the print dialog. Use Download .HTM below to save and print or export to PDF from your browser.'
      );
      return;
    }

    if (!printEventFired && elapsed < 120) {
      printFallbackTimerRef.current = window.setTimeout(() => {
        printFallbackTimerRef.current = null;
        if (!printEventFired) {
          cleanup();
          setPrintBlockedMessage(
            'This embedded preview frame blocked the system print dialog. Use Download .HTM (or Share) to open the file in Chrome/Safari and print or save as PDF.'
          );
        }
      }, 450);
    } else {
      // Safety net in case afterprint does not fire in some WebViews
      printSafetyTimerRef.current = window.setTimeout(cleanup, 120000);
    }
  };

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
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-5xl h-[92dvh] sm:h-[88vh] max-h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 px-3 sm:px-5 py-3 border-b border-[var(--barn-border)] min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <h2 className="text-sm sm:text-base font-semibold truncate min-w-0">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="lg:hidden shrink-0 min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0 w-full lg:w-auto lg:justify-end">
            {onToggleIncludePrimaryPhoto && (
              <label className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
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
                onClick={() => {
                  const target = Math.abs(zoom - 1) < 0.02 && fitZoom < 0.99 ? fitZoom : 1;
                  applyZoomCentered(target);
                }}
                title={fitZoom < 0.99 ? 'Toggle fit width / 100%' : 'Reset preview zoom to 100%'}
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
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download .HTM
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="hidden lg:flex shrink-0 min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {pedigreePrintOptions && onChangePedigreePrintOptions && (
          <div className="px-3 sm:px-5 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/75 flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showWeights ?? true}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showWeights: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Show Weights</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showGenotypes ?? false}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showGenotypes: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Include Coat Genotypes (Unverified · Under Dev)</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={pedigreePrintOptions.showBreederFooter ?? true}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    showBreederFooter: e.target.checked,
                  })
                }
                className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>Breeder Signature Footer</span>
            </label>

            {(pedigreePrintOptions.showBreederFooter ?? true) && (
              <input
                type="text"
                value={pedigreePrintOptions.breederContactLine ?? ''}
                onChange={(e) =>
                  onChangePedigreePrintOptions({
                    ...pedigreePrintOptions,
                    breederContactLine: e.target.value,
                  })
                }
                placeholder="Optional breeder website or contact footer line..."
                aria-label="Optional breeder website or contact footer line"
                className="flex-1 min-w-[200px] min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]"
              />
            )}
          </div>
        )}

        {binderPrintOptions && onChangeBinderPrintOptions && (
          <div className="px-3 sm:px-5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/80 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Color vs Ink Saver Mode (Paper is always locked #FFFFFF) */}
              <div
                role="group"
                aria-label="Binder color mode"
                className="inline-flex items-center p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <button
                  type="button"
                  aria-pressed={binderPrintOptions.colorMode === 'color'}
                  onClick={() =>
                    onChangeBinderPrintOptions({ ...binderPrintOptions, colorMode: 'color' })
                  }
                  className={`min-h-[30px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    binderPrintOptions.colorMode === 'color'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Barn Colors (White Paper)
                </button>
                <button
                  type="button"
                  aria-pressed={binderPrintOptions.colorMode === 'ink_saver'}
                  onClick={() =>
                    onChangeBinderPrintOptions({ ...binderPrintOptions, colorMode: 'ink_saver' })
                  }
                  className={`min-h-[30px] px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                    binderPrintOptions.colorMode === 'ink_saver'
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Ink Saver (B&amp;W)
                </button>
              </div>

              {/* Active Default vs Full Archive Toggle */}
              <label className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeArchived}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeArchived: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Include Archived / Sold / Deceased
                  {binderArchivedCount > 0 ? ` (${binderArchivedCount})` : ''}
                </span>
              </label>

              {/* Pedigree Depth */}
              <div
                role="group"
                aria-label="Binder pedigree depth"
                className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
              >
                <span className="px-1.5 text-[11px] text-[var(--barn-muted)]">Pedigree:</span>
                {([3, 4, 5, 6] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={binderPrintOptions.generations === g}
                    onClick={() =>
                      onChangeBinderPrintOptions({ ...binderPrintOptions, generations: g })
                    }
                    className={`min-h-[28px] px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold transition-colors ${
                      binderPrintOptions.generations === g
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    {g}G
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeCoverAndSignature}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeCoverAndSignature: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Cover &amp; Signature Page</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeSpeciesOverview}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeSpeciesOverview: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Index, Schedule, Cages &amp; Memo</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includePhotos}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includePhotos: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Photos &amp; Captions</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeHealthAndLitters}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeHealthAndLitters: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Medical &amp; Litters</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={binderPrintOptions.includeShowsAndKinship}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      includeShowsAndKinship: e.target.checked,
                    })
                  }
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Shows, Reg # &amp; Relatives</span>
              </label>

              {binderPrintOptions.includeCoverAndSignature && (
                <input
                  type="text"
                  value={binderPrintOptions.breederTransferNote ?? ''}
                  onChange={(e) =>
                    onChangeBinderPrintOptions({
                      ...binderPrintOptions,
                      breederTransferNote: e.target.value,
                    })
                  }
                  placeholder="Optional breeder contact / sale transfer note..."
                  aria-label="Optional breeder contact or sale transfer note"
                  className="flex-1 min-w-[210px] min-h-[30px] px-2.5 py-0.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs text-[var(--barn-ink)] placeholder:text-[var(--barn-muted)]"
                />
              )}
            </div>
          </div>
        )}

        {(headerNotice || pedigreePrintOptions?.showGenotypes || binderPrintOptions) && (
          <div className="px-3 sm:px-5 py-2 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 flex flex-wrap items-center gap-2">
            {headerNotice}
            {(pedigreePrintOptions?.showGenotypes || binderPrintOptions) && (
              <ColorGeneticsNotice compact />
            )}
          </div>
        )}

        {printBlockedMessage && (
          <div
            role="status"
            className="px-3 sm:px-5 py-2.5 bg-[var(--barn-terracotta-tint)] border-b border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-[var(--barn-ink)]"
          >
            <div className="flex items-start justify-between gap-2 min-w-0 flex-1">
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle
                  className="w-4 h-4 shrink-0 mt-0.5 text-[var(--barn-terracotta)]"
                  aria-hidden="true"
                />
                <span className="leading-snug">{printBlockedMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setPrintBlockedMessage(null)}
                aria-label="Dismiss print notice"
                className="sm:hidden shrink-0 min-h-[28px] min-w-[28px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 pl-6 sm:pl-0">
              {canShareHtml && (
                <button
                  type="button"
                  onClick={handleShareHtm}
                  className="min-h-[34px] px-3 py-1 rounded-md bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Share .HTM
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadHtm}
                className="min-h-[34px] px-3 py-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Download .HTM
              </button>
              <button
                type="button"
                onClick={() => setPrintBlockedMessage(null)}
                aria-label="Dismiss print notice"
                className="hidden sm:flex min-h-[32px] min-w-[32px] rounded-md hover:bg-black/10 dark:hover:bg-white/10 items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div
          ref={viewportRef}
          style={{
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'contain',
            overflowAnchor: 'none',
          }}
          className="flex-1 min-h-0 bg-neutral-200 dark:bg-neutral-900 p-3 sm:p-4 overflow-auto"
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
                colorScheme: 'light',
                backgroundColor: '#ffffff',
              }}
              className="bg-white rounded-lg border border-neutral-300 shadow-sm block"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
