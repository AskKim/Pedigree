/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Zero-dependency ES2018-compatible scroll window virtualizer for large
 * lists and data tables.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualWindowRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

export interface ComputeVirtualWindowParams {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  estimateSize: number;
  overscan?: number;
  initialFallbackCount?: number;
  measuredHeights?: ReadonlyMap<number, number>;
}

/**
 * Pure ES2018 calculation for visible index window and top/bottom spacer heights.
 * Guarantees at least `initialFallbackCount` items on zero-height pre-layout renders.
 */
export function computeVirtualWindow(params: ComputeVirtualWindowParams): VirtualWindowRange {
  const itemCount = Math.max(0, Math.floor(params.itemCount));
  const estimateSize = Math.max(20, params.estimateSize || 44);
  const overscan = Math.max(0, Math.floor(params.overscan ?? 6));
  const initialFallbackCount = Math.max(1, Math.floor(params.initialFallbackCount ?? 20));
  const measured = params.measuredHeights;

  if (itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    };
  }

  const getHeight = (idx: number): number => {
    if (!measured) return estimateSize;
    const h = measured.get(idx);
    return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : estimateSize;
  };

  let totalHeight = 0;
  for (let i = 0; i < itemCount; i++) {
    totalHeight += getHeight(i);
  }

  const viewportHeight = Math.max(0, params.viewportHeight || 0);
  if (viewportHeight <= 0) {
    const endIndex = Math.min(itemCount - 1, initialFallbackCount - 1);
    let renderedHeight = 0;
    for (let i = 0; i <= endIndex; i++) {
      renderedHeight += getHeight(i);
    }
    return {
      startIndex: 0,
      endIndex,
      paddingTop: 0,
      paddingBottom: Math.max(0, totalHeight - renderedHeight),
      totalHeight,
    };
  }

  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const clampedScrollTop = Math.max(0, Math.min(params.scrollTop || 0, maxScrollTop));
  const visibleBottom = clampedScrollTop + viewportHeight;

  let offset = 0;
  let rawStart = 0;
  let foundStart = false;
  let rawEnd = itemCount - 1;

  for (let i = 0; i < itemCount; i++) {
    const h = getHeight(i);
    const nextOffset = offset + h;
    if (!foundStart && nextOffset > clampedScrollTop) {
      rawStart = i;
      foundStart = true;
    }
    if (offset >= visibleBottom) {
      rawEnd = Math.max(rawStart, i - 1);
      break;
    }
    offset = nextOffset;
  }

  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(itemCount - 1, rawEnd + overscan);

  let paddingTop = 0;
  for (let i = 0; i < startIndex; i++) {
    paddingTop += getHeight(i);
  }

  let renderedHeight = 0;
  for (let i = startIndex; i <= endIndex; i++) {
    renderedHeight += getHeight(i);
  }

  const paddingBottom = Math.max(0, totalHeight - paddingTop - renderedHeight);

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
  };
}

export interface UseVirtualWindowOptions {
  itemCount: number;
  estimateSize: number;
  overscan?: number;
  initialFallbackCount?: number;
  /** Change this key (e.g. search query, filter, category) to reset scrollTop to 0 and clear stale row heights. */
  resetKey?: string;
}

export interface UseVirtualWindowResult {
  scrollContainerRef: (node: HTMLDivElement | null) => void;
  measureRowRef: (index: number) => (node: HTMLElement | null) => void;
  windowRange: VirtualWindowRange;
  scrollToTop: () => void;
}

export function useVirtualWindow(options: UseVirtualWindowOptions): UseVirtualWindowResult {
  const { itemCount, estimateSize, overscan = 6, initialFallbackCount = 20, resetKey = '' } = options;

  const containerElRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const rowElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const elementIndexMapRef = useRef<Map<HTMLElement, number>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const [scrollMetrics, setScrollMetrics] = useState<{ scrollTop: number; viewportHeight: number }>({
    scrollTop: 0,
    viewportHeight: 0,
  });
  const [measureVersion, setMeasureVersion] = useState(0);

  const syncMetricsNow = useCallback(() => {
    const el = containerElRef.current;
    if (!el) return;
    const nextTop = el.scrollTop || 0;
    const nextHeight = el.clientHeight || 0;
    setScrollMetrics((prev) => {
      if (
        Math.abs(prev.scrollTop - nextTop) < 4 &&
        Math.abs(prev.viewportHeight - nextHeight) < 2
      ) {
        return prev;
      }
      return { scrollTop: nextTop, viewportHeight: nextHeight };
    });
  }, []);

  const scheduleMetricsSync = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      syncMetricsNow();
      return;
    }
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncMetricsNow();
    });
  }, [syncMetricsNow]);

  const scrollToTop = useCallback(() => {
    const el = containerElRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    setScrollMetrics((prev) => ({
      scrollTop: 0,
      viewportHeight: el?.clientHeight ?? prev.viewportHeight,
    }));
  }, []);

  // Reset cached row measurements & scroll offset when filter/category/query changes
  useEffect(() => {
    measuredHeightsRef.current.clear();
    setMeasureVersion((v) => v + 1);
    scrollToTop();
  }, [resetKey, scrollToTop]);

  // Trim stale high-index measurements if itemCount shrinks
  useEffect(() => {
    const map = measuredHeightsRef.current;
    if (map.size === 0) return;
    let deleted = false;
    map.forEach((_val, idx) => {
      if (idx >= itemCount) {
        map.delete(idx);
        deleted = true;
      }
    });
    if (deleted) {
      setMeasureVersion((v) => v + 1);
    }
  }, [itemCount]);

  // Manage ResizeObserver for row elements and scroll container
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const target = entry.target as HTMLElement;
        if (target === containerElRef.current) {
          scheduleMetricsSync();
          continue;
        }
        const idx = elementIndexMapRef.current.get(target);
        if (typeof idx === 'number') {
          const rect = target.getBoundingClientRect();
          const h = Math.round(rect.height || entry.contentRect.height);
          if (h > 0 && measuredHeightsRef.current.get(idx) !== h) {
            measuredHeightsRef.current.set(idx, h);
            changed = true;
          }
        }
      }
      if (changed) {
        setMeasureVersion((v) => v + 1);
      }
    });
    resizeObserverRef.current = ro;

    if (containerElRef.current) {
      ro.observe(containerElRef.current);
    }
    rowElementsRef.current.forEach((el) => {
      ro.observe(el);
    });

    return () => {
      ro.disconnect();
      resizeObserverRef.current = null;
    };
  }, [scheduleMetricsSync]);

  // Attach/detach scroll & window resize listeners cleanly
  const scrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      const prev = containerElRef.current;
      if (prev && prev !== node) {
        prev.removeEventListener('scroll', scheduleMetricsSync);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(prev);
        }
      }
      containerElRef.current = node;
      if (node) {
        node.addEventListener('scroll', scheduleMetricsSync, { passive: true });
        if (resizeObserverRef.current) {
          resizeObserverRef.current.observe(node);
        }
        syncMetricsNow();
      }
    },
    [scheduleMetricsSync, syncMetricsNow]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('resize', scheduleMetricsSync, { passive: true });
    return () => {
      window.removeEventListener('resize', scheduleMetricsSync);
      if (rafIdRef.current !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (containerElRef.current) {
        containerElRef.current.removeEventListener('scroll', scheduleMetricsSync);
      }
    };
  }, [scheduleMetricsSync]);

  const rowCallbacksRef = useRef<Map<number, (node: HTMLElement | null) => void>>(new Map());

  useEffect(() => {
    const callbacks = rowCallbacksRef.current;
    if (callbacks.size > Math.max(512, itemCount + 128)) {
      callbacks.clear();
    }
  }, [itemCount]);

  useEffect(() => {
    const callbacks = rowCallbacksRef.current;
    const rowElements = rowElementsRef.current;
    const elementIndexMap = elementIndexMapRef.current;
    return () => {
      callbacks.clear();
      rowElements.clear();
      elementIndexMap.clear();
    };
  }, []);

  const measureRowRef = useCallback((index: number) => {
    const existing = rowCallbacksRef.current.get(index);
    if (existing) return existing;

    const cb = (node: HTMLElement | null) => {
      const prevNode = rowElementsRef.current.get(index);
      if (prevNode && prevNode !== node) {
        elementIndexMapRef.current.delete(prevNode);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.unobserve(prevNode);
        }
      }
      if (!node) {
        rowElementsRef.current.delete(index);
        return;
      }
      if (prevNode === node) {
        return;
      }
      rowElementsRef.current.set(index, node);
      elementIndexMapRef.current.set(node, index);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.observe(node);
      }
      const rect = node.getBoundingClientRect();
      const h = Math.round(rect.height);
      if (h > 0 && measuredHeightsRef.current.get(index) !== h) {
        measuredHeightsRef.current.set(index, h);
        setMeasureVersion((v) => v + 1);
      }
    };
    rowCallbacksRef.current.set(index, cb);
    return cb;
  }, []);

  const windowRange = useMemo(() => {
    void measureVersion;
    return computeVirtualWindow({
      itemCount,
      scrollTop: scrollMetrics.scrollTop,
      viewportHeight: scrollMetrics.viewportHeight,
      estimateSize,
      overscan,
      initialFallbackCount,
      measuredHeights: measuredHeightsRef.current,
    });
  }, [
    itemCount,
    scrollMetrics.scrollTop,
    scrollMetrics.viewportHeight,
    estimateSize,
    overscan,
    initialFallbackCount,
    measureVersion,
  ]);

  return {
    scrollContainerRef,
    measureRowRef,
    windowRange,
    scrollToTop,
  };
}
