/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Crash Handler, Verbose Diagnostic & Memory Logger, and Retention Manager.
 *
 * Captures:
 * - Uncaught window runtime errors & resource load errors
 * - Unhandled Promise rejections (async IndexedDB / SQLite / image / ZIP errors)
 * - React ErrorBoundary component crashes
 * - Memory pressure warnings (`performance.memory`, `QuotaExceededError`, Allocation failures)
 * - Unclean previous-session exits (detects Android/iOS OS tab kills or silent OOM crashes)
 * - Verbose console error/warning & key storage/backup lifecycle breadcrumbs
 *
 * Storage Guardrails:
 * - Bounded retention window (`3`, `7`, or `14` days; default `7` days) + max entry count (500)
 * - Synchronous `localStorage` ring buffer for critical/error logs so crash data survives sudden kills
 * - IndexedDB store for full verbose history with automatic pruning
 */

import { generateUuid, nowIsoUtc } from '../core/models';

export const DEFAULT_SUPPORT_EMAIL = '';

function isLegacyPrefillHash(val: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < val.length; i++) {
    h ^= val.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) === 1951363555;
}

function sanitizeSupportEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || isLegacyPrefillHash(trimmed.toLowerCase())) return '';
  return raw;
}

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type DiagnosticCategory =
  | 'runtime'
  | 'promise'
  | 'react'
  | 'memory'
  | 'storage'
  | 'media'
  | 'lifecycle'
  | 'console';

export interface MemorySample {
  usedHeapBytes: number | null;
  totalHeapBytes: number | null;
  heapLimitBytes: number | null;
  heapPercent: number | null;
  deviceMemoryGb: number | null;
  storageUsageBytes?: number;
  storageQuotaBytes?: number;
}

export interface DiagnosticLogEntry {
  id: string;
  timestampIso: string;
  timestampMs: number;
  sessionId: string;
  level: DiagnosticLogLevel;
  category: DiagnosticCategory;
  route: string;
  message: string;
  stack?: string;
  componentStack?: string;
  details?: string;
  memory?: MemorySample;
}

export type LogRetentionDays = 3 | 7 | 14;

export interface DiagnosticConfig {
  verboseEnabled: boolean;
  retentionDays: LogRetentionDays;
  supportEmail: string;
}

export interface DiagnosticSummary {
  totalEntries: number;
  errorCount: number;
  memoryWarningCount: number;
  crashCount: number;
  oldestEntryIso: string | null;
  newestEntryIso: string | null;
  currentMemory: MemorySample;
  config: DiagnosticConfig;
  sessionId: string;
  userAgent: string;
  platformInfo: string;
}

const LOG_IDB_NAME = 'community_pedigree_diagnostics_v1';
const LOG_STORE_NAME = 'diagnostic_logs';
const CONFIG_STORAGE_KEY = 'pedigree_diagnostic_config_v1';
const RING_STORAGE_KEY = 'pedigree_crash_ring_v1';
const SESSION_HEARTBEAT_KEY = 'pedigree_session_heartbeat_v1';

const MAX_RING_ENTRIES = 60;
const MAX_IDB_ENTRIES = 500;
const MEMORY_POLL_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const VERBOSE_MEMORY_HEARTBEAT_MS = 5 * 60_000;

const DEFAULT_CONFIG: DiagnosticConfig = {
  verboseEnabled: true,
  retentionDays: 7,
  supportEmail: DEFAULT_SUPPORT_EMAIL,
};

interface SessionHeartbeat {
  sessionId: string;
  active: boolean;
  startedAtMs: number;
  lastAliveMs: number;
  lastRoute: string;
  lastHeapPercent: number | null;
  lastHeapBytes: number | null;
}

const SESSION_ID = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let handlersInstalled = false;
let currentRoute = 'boot';
let lastLoggedMemoryBytes: number | null = null;
let lastVerboseMemoryLogMs = 0;
let loggingConsole = false;
let memoryIntervalId: ReturnType<typeof setInterval> | null = null;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Never let a diagnostic subscriber crash logging
    }
  }
}

export function subscribeDiagnosticLogs(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function setCurrentDiagnosticRoute(route: string): void {
  currentRoute = route || 'unknown';
  updateSessionHeartbeat(true);
}

export function getDiagnosticConfig(): DiagnosticConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<DiagnosticConfig>;
    const days = parsed.retentionDays === 3 || parsed.retentionDays === 7 || parsed.retentionDays === 14
      ? parsed.retentionDays
      : DEFAULT_CONFIG.retentionDays;
    return {
      verboseEnabled: parsed.verboseEnabled !== false,
      retentionDays: days,
      supportEmail: sanitizeSupportEmail(parsed.supportEmail).trim(),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function updateDiagnosticConfig(patch: Partial<DiagnosticConfig>): DiagnosticConfig {
  const next: DiagnosticConfig = {
    ...getDiagnosticConfig(),
    ...patch,
  };
  if (next.retentionDays !== 3 && next.retentionDays !== 7 && next.retentionDays !== 14) {
    next.retentionDays = 7;
  }
  next.supportEmail = sanitizeSupportEmail(next.supportEmail);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota issue while saving config
    }
  }
  void pruneExpiredDiagnosticLogs();
  notifySubscribers();
  return next;
}

function sanitizeLogString(raw: unknown, maxLen: number): string {
  let str: string;
  if (typeof raw === 'string') {
    str = raw;
  } else if (raw instanceof Error) {
    str = `${raw.name}: ${raw.message}`;
  } else {
    try {
      str = JSON.stringify(raw);
    } catch {
      str = String(raw ?? '');
    }
  }
  // Scrub large base64 data URIs so logs never cause memory bloat
  str = str.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]{80,}/g, '[image-data-uri omitted]');
  if (str.length > maxLen) {
    return `${str.slice(0, maxLen)}… [truncated]`;
  }
  return str;
}

export function captureMemorySample(): MemorySample {
  const perfMem =
    typeof performance !== 'undefined'
      ? (performance as Performance & {
          memory?: {
            usedJSHeapSize?: number;
            totalJSHeapSize?: number;
            jsHeapSizeLimit?: number;
          };
        }).memory
      : undefined;

  const usedHeapBytes =
    perfMem && typeof perfMem.usedJSHeapSize === 'number' ? perfMem.usedJSHeapSize : null;
  const totalHeapBytes =
    perfMem && typeof perfMem.totalJSHeapSize === 'number' ? perfMem.totalJSHeapSize : null;
  const heapLimitBytes =
    perfMem && typeof perfMem.jsHeapSizeLimit === 'number' ? perfMem.jsHeapSizeLimit : null;
  const heapPercent =
    usedHeapBytes !== null && heapLimitBytes && heapLimitBytes > 0
      ? Math.round((usedHeapBytes / heapLimitBytes) * 1000) / 10
      : null;

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number })
      : undefined;
  const deviceMemoryGb = nav && typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;

  return {
    usedHeapBytes,
    totalHeapBytes,
    heapLimitBytes,
    heapPercent,
    deviceMemoryGb,
  };
}

export async function captureMemoryAndStorageSample(): Promise<MemorySample> {
  const base = captureMemorySample();
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      base.storageUsageBytes = Number(est.usage) || 0;
      base.storageQuotaBytes = Number(est.quota) || 0;
    } catch {
      // Ignore storage estimate failures
    }
  }
  return base;
}

export function isMemoryLikeError(errOrMessage: unknown): boolean {
  const text =
    errOrMessage instanceof Error
      ? `${errOrMessage.name} ${errOrMessage.message} ${errOrMessage.stack || ''}`
      : String(errOrMessage ?? '');
  return /out of memory|oom|allocation failed|array buffer allocation|rangeerror|quotaexceeded|ns_error_dom_quota|datacloneerror|maximum call stack|cannot allocate|memory/i.test(
    text
  );
}

function getCutoffTimestampMs(retentionDays: number): number {
  return Date.now() - Math.max(1, retentionDays) * 86_400_000;
}

function readRingBuffer(): DiagnosticLogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = getCutoffTimestampMs(getDiagnosticConfig().retentionDays);
    return parsed.filter(
      (item: any) => item && typeof item.timestampMs === 'number' && item.timestampMs >= cutoff
    );
  } catch {
    return [];
  }
}

function writeRingBufferSync(entry: DiagnosticLogEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const existing = readRingBuffer();
    const cutoff = getCutoffTimestampMs(getDiagnosticConfig().retentionDays);
    const filtered = [
      ...existing.filter((e) => e.id !== entry.id && e.timestampMs >= cutoff),
      entry,
    ].slice(-MAX_RING_ENTRIES);
    localStorage.setItem(RING_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // If localStorage is completely full, trim aggressively and retry once
    try {
      localStorage.setItem(RING_STORAGE_KEY, JSON.stringify([entry]));
    } catch {
      // Ignore
    }
  }
}

function openLogsIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(LOG_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOG_STORE_NAME)) {
        const store = db.createObjectStore(LOG_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestampMs', 'timestampMs', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistEntryToIdb(entry: DiagnosticLogEntry): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openLogsIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOG_STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ring buffer already persisted critical entries synchronously
  }
}

export async function pruneExpiredDiagnosticLogs(): Promise<void> {
  const cfg = getDiagnosticConfig();
  const cutoff = getCutoffTimestampMs(cfg.retentionDays);

  if (typeof localStorage !== 'undefined') {
    try {
      const ring = readRingBuffer().filter((e) => e.timestampMs >= cutoff);
      localStorage.setItem(RING_STORAGE_KEY, JSON.stringify(ring));
    } catch {
      // Ignore
    }
  }

  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openLogsIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
      const store = tx.objectStore(LOG_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as DiagnosticLogEntry[]) || [];
        all.sort((a, b) => b.timestampMs - a.timestampMs);
        all.forEach((item, idx) => {
          if (item.timestampMs < cutoff || idx >= MAX_IDB_ENTRIES) {
            store.delete(item.id);
          }
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function listDiagnosticLogs(): Promise<DiagnosticLogEntry[]> {
  const cfg = getDiagnosticConfig();
  const cutoff = getCutoffTimestampMs(cfg.retentionDays);
  const ring = readRingBuffer();
  const byId = new Map<string, DiagnosticLogEntry>();
  for (const e of ring) {
    if (e.timestampMs >= cutoff) byId.set(e.id, e);
  }

  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openLogsIdb();
      const idbItems = await new Promise<DiagnosticLogEntry[]>((resolve) => {
        const tx = db.transaction(LOG_STORE_NAME, 'readonly');
        const req = tx.objectStore(LOG_STORE_NAME).getAll();
        req.onsuccess = () => resolve((req.result as DiagnosticLogEntry[]) || []);
        req.onerror = () => resolve([]);
      });
      db.close();
      for (const e of idbItems) {
        if (e && e.timestampMs >= cutoff) {
          byId.set(e.id, e);
        }
      }
    } catch {
      // Fall back to ring buffer entries
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.timestampMs - a.timestampMs);
}

export async function clearAllDiagnosticLogs(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(RING_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await openLogsIdb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(LOG_STORE_NAME, 'readwrite');
        tx.objectStore(LOG_STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    } catch {
      // Ignore
    }
  }
  notifySubscribers();
}

export async function getDiagnosticSummary(
  prefetchedEntries?: DiagnosticLogEntry[]
): Promise<DiagnosticSummary> {
  const entries = prefetchedEntries ?? (await listDiagnosticLogs());
  const cfg = getDiagnosticConfig();
  const currentMemory = await captureMemoryAndStorageSample();
  const errorCount = entries.filter((e) => e.level === 'error' || e.level === 'fatal').length;
  const memoryWarningCount = entries.filter(
    (e) => e.category === 'memory' && (e.level === 'warn' || e.level === 'error' || e.level === 'fatal')
  ).length;
  const crashCount = entries.filter(
    (e) => e.level === 'fatal' || e.category === 'react'
  ).length;

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const ua = nav?.userAgent || 'Unknown browser';
  const cores = nav?.hardwareConcurrency ? `${nav.hardwareConcurrency} cores` : 'unknown cores';
  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
      : 'non-DOM';

  return {
    totalEntries: entries.length,
    errorCount,
    memoryWarningCount,
    crashCount,
    oldestEntryIso: entries.length ? entries[entries.length - 1].timestampIso : null,
    newestEntryIso: entries.length ? entries[0].timestampIso : null,
    currentMemory,
    config: cfg,
    sessionId: SESSION_ID,
    userAgent: ua,
    platformInfo: `${viewport} · ${cores}${currentMemory.deviceMemoryGb ? ` · ${currentMemory.deviceMemoryGb}GB RAM` : ''}`,
  };
}

export function logDiagnosticEvent(params: {
  level: DiagnosticLogLevel;
  category: DiagnosticCategory;
  message: string;
  error?: unknown;
  componentStack?: string;
  details?: unknown;
}): DiagnosticLogEntry | null {
  const cfg = getDiagnosticConfig();
  const isCritical =
    params.level === 'error' || params.level === 'fatal' || params.category === 'react';

  // When verbose logging is toggled off, still record errors/crashes/memory faults!
  if (!cfg.verboseEnabled && !isCritical && params.category !== 'memory') {
    return null;
  }

  let stack: string | undefined;
  if (params.error instanceof Error) {
    stack = sanitizeLogString(params.error.stack || params.error.message, 2500);
  } else if (params.error !== undefined) {
    stack = sanitizeLogString(params.error, 1500);
  }

  const memoryFaultDetected =
    isMemoryLikeError(params.message) || (params.error ? isMemoryLikeError(params.error) : false);
  const category: DiagnosticCategory =
    memoryFaultDetected && params.category !== 'react' ? 'memory' : params.category;

  const entry: DiagnosticLogEntry = {
    id: generateUuid(),
    timestampIso: nowIsoUtc(),
    timestampMs: Date.now(),
    sessionId: SESSION_ID,
    level: params.level,
    category,
    route: currentRoute,
    message: sanitizeLogString(params.message, 600),
    stack,
    componentStack: params.componentStack
      ? sanitizeLogString(params.componentStack, 2500)
      : undefined,
    details:
      params.details !== undefined ? sanitizeLogString(params.details, 1500) : undefined,
    memory: captureMemorySample(),
  };

  if (isCritical || params.level === 'warn' || params.category === 'memory') {
    writeRingBufferSync(entry);
  }

  void persistEntryToIdb(entry).then(() => {
    notifySubscribers();
  });

  if (isCritical || params.level === 'warn') {
    notifySubscribers();
  }

  return entry;
}

export function recordReactCrash(
  error: Error,
  componentStack?: string
): DiagnosticLogEntry | null {
  return logDiagnosticEvent({
    level: 'fatal',
    category: 'react',
    message: `React Render Crash: ${error.name}: ${error.message}`,
    error,
    componentStack,
    details: { memoryFault: isMemoryLikeError(error) },
  });
}

function updateSessionHeartbeat(active: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const mem = captureMemorySample();
    const hb: SessionHeartbeat = {
      sessionId: SESSION_ID,
      active,
      startedAtMs: Date.now(),
      lastAliveMs: Date.now(),
      lastRoute: currentRoute,
      lastHeapPercent: mem.heapPercent,
      lastHeapBytes: mem.usedHeapBytes,
    };
    localStorage.setItem(SESSION_HEARTBEAT_KEY, JSON.stringify(hb));
  } catch {
    // Ignore heartbeat write failures
  }
}

function inspectPreviousSessionUncleanExit(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(SESSION_HEARTBEAT_KEY);
    if (!raw) return;
    const prev = JSON.parse(raw) as Partial<SessionHeartbeat>;
    if (prev.active && prev.sessionId && prev.sessionId !== SESSION_ID) {
      const gapMs = prev.lastAliveMs ? Date.now() - prev.lastAliveMs : 0;
      const highHeap = (prev.lastHeapPercent ?? 0) >= 70;
      const lastAliveIso = prev.lastAliveMs
        ? new Date(prev.lastAliveMs).toISOString()
        : 'unknown time';
      logDiagnosticEvent({
        level: highHeap ? 'error' : 'warn',
        category: highHeap ? 'memory' : 'lifecycle',
        message: `Previous session (${prev.sessionId}) terminated unexpectedly without clean pagehide (last active ${lastAliveIso}, route "${prev.lastRoute || 'unknown'}"${
          prev.lastHeapPercent !== null && prev.lastHeapPercent !== undefined
            ? `, JS heap ${prev.lastHeapPercent}%`
            : ''
        }). Possible mobile OS tab kill / out-of-memory reload.`,
        details: {
          previousSessionId: prev.sessionId,
          lastRoute: prev.lastRoute,
          lastHeapPercent: prev.lastHeapPercent,
          lastHeapBytes: prev.lastHeapBytes,
          downtimeMs: gapMs,
        },
      });
    }
  } catch {
    // Ignore malformed heartbeat
  }
}

async function sampleMemoryPressure(): Promise<void> {
  const mem = await captureMemoryAndStorageSample();
  const cfg = getDiagnosticConfig();
  const used = mem.usedHeapBytes;
  const heapPct = mem.heapPercent;

  const deltaBytes =
    used !== null && lastLoggedMemoryBytes !== null ? used - lastLoggedMemoryBytes : 0;
  if (used !== null) {
    lastLoggedMemoryBytes = used;
  }

  const storagePct =
    mem.storageUsageBytes && mem.storageQuotaBytes && mem.storageQuotaBytes > 0
      ? Math.round((mem.storageUsageBytes / mem.storageQuotaBytes) * 1000) / 10
      : 0;

  if (heapPct !== null && heapPct >= 88) {
    logDiagnosticEvent({
      level: 'error',
      category: 'memory',
      message: `Critical JS heap memory pressure (${heapPct}% of browser heap limit)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (heapPct !== null && heapPct >= 75) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'memory',
      message: `High JS heap memory usage (${heapPct}% of browser heap limit)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (deltaBytes >= 45 * 1024 * 1024) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'memory',
      message: `Sudden JS heap spike (+${Math.round(deltaBytes / (1024 * 1024))} MB since last sample)`,
      details: { ...mem, deltaBytes, storagePct },
    });
    return;
  }

  if (storagePct >= 85) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: `Browser local storage quota high (${storagePct}% used)`,
      details: { ...mem, storagePct },
    });
    return;
  }

  const now = Date.now();
  if (cfg.verboseEnabled && now - lastVerboseMemoryLogMs >= VERBOSE_MEMORY_HEARTBEAT_MS) {
    lastVerboseMemoryLogMs = now;
    logDiagnosticEvent({
      level: 'debug',
      category: 'memory',
      message: `Periodic memory & storage snapshot (${
        heapPct !== null ? `${heapPct}% heap` : 'heap metric n/a'
      }, ${storagePct}% storage)`,
      details: { ...mem, storagePct },
    });
  }
}

export function installGlobalCrashHandlers(): void {
  if (typeof window === 'undefined' || handlersInstalled) return;
  handlersInstalled = true;

  inspectPreviousSessionUncleanExit();
  updateSessionHeartbeat(true);
  void pruneExpiredDiagnosticLogs();

  logDiagnosticEvent({
    level: 'info',
    category: 'lifecycle',
    message: `App diagnostic session started (${SESSION_ID})`,
  });

  // 1. Global uncaught errors & resource load errors
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown) && 'tagName' in target) {
        const src = (target as HTMLImageElement).src || (target as HTMLScriptElement).src || '';
        logDiagnosticEvent({
          level: 'error',
          category: 'runtime',
          message: `Resource load error on <${target.tagName.toLowerCase()}>`,
          details: { src },
        });
        return;
      }

      const errObj = event.error;
      const msg = event.message || (errObj instanceof Error ? errObj.message : 'Uncaught runtime error');
      logDiagnosticEvent({
        level: 'fatal',
        category: isMemoryLikeError(errObj || msg) ? 'memory' : 'runtime',
        message: msg,
        error: errObj,
        details: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    },
    true
  );

  // 2. Unhandled Promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `Unhandled Promise Rejection: ${reason.name}: ${reason.message}`
        : `Unhandled Promise Rejection: ${sanitizeLogString(reason, 400)}`;
    logDiagnosticEvent({
      level: 'error',
      category: isMemoryLikeError(reason || msg) ? 'memory' : 'promise',
      message: msg,
      error: reason,
    });
  });

  // 3. Intercept console.error and console.warn safely
  const origConsoleError = console.error.bind(console);
  const origConsoleWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    if (loggingConsole) return;
    loggingConsole = true;
    try {
      const firstErr = args.find((a) => a instanceof Error);
      const summary = args.map((a) => sanitizeLogString(a, 300)).join(' ');
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(firstErr || summary) ? 'memory' : 'console',
        message: summary || 'console.error triggered',
        error: firstErr,
      });
    } finally {
      loggingConsole = false;
    }
  };

  console.warn = (...args: unknown[]) => {
    origConsoleWarn(...args);
    if (loggingConsole) return;
    loggingConsole = true;
    try {
      const summary = args.map((a) => sanitizeLogString(a, 300)).join(' ');
      if (summary) {
        logDiagnosticEvent({
          level: 'warn',
          category: isMemoryLikeError(summary) ? 'memory' : 'console',
          message: summary,
        });
      }
    } finally {
      loggingConsole = false;
    }
  };

  // 4. Clean exit & visibility lifecycle hooks
  window.addEventListener('pagehide', () => {
    updateSessionHeartbeat(false);
  });

  window.addEventListener('beforeunload', () => {
    updateSessionHeartbeat(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      updateSessionHeartbeat(false);
    } else {
      updateSessionHeartbeat(true);
      void sampleMemoryPressure();
    }
  });

  // 5. Periodic heartbeat + memory watchdog
  if (!heartbeatIntervalId) {
    heartbeatIntervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        updateSessionHeartbeat(true);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  if (!memoryIntervalId) {
    memoryIntervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sampleMemoryPressure();
      }
    }, MEMORY_POLL_INTERVAL_MS);
  }
}
