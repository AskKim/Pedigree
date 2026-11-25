/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Platform Bridge & Capability Implementation (`@engine/bridge/platformBridge.ts`).
 */

import { bytesToBase64Pure } from '../binaryEncoding';
import {
  createDesktopBridgeDelegates,
  type DesktopHostLike,
  detectDesktopShellType,
} from './desktopBridgeAdapter';
import type {
  IPlatformBridge,
  NativeStorageBridgeOperation,
  NativeStorageBridgeResult,
  PlatformBackHandler,
  PlatformCapabilities,
  PlatformDiagnosticEvent,
  PlatformExportOptions,
  PlatformExportResult,
  PlatformPrintOptions,
  PlatformShellType,
} from './platformBridge.interface';

export const DEFAULT_IOS_STORAGE_REPLY_GLOBAL = '__platformBridgeStorageReceive';
const DEFAULT_IOS_STORAGE_TIMEOUT_MS = 5000;

interface WebKitMessageHandler {
  postMessage: (message: unknown) => void;
}

interface NativePostMessageTarget {
  postMessage: (message: string | ArrayBuffer) => void;
}

interface HostGlobalScope extends DesktopHostLike {
  AndroidBridge?: NativePostMessageTarget;
  webkit?: {
    messageHandlers?: Record<string, WebKitMessageHandler | undefined>;
  };
  navigator?: Navigator & {
    standalone?: boolean;
    storage?: StorageManager;
  };
  location?: Location;
  document?: Document;
  indexedDB?: IDBFactory;
  Worker?: typeof Worker;
  WebAssembly?: typeof WebAssembly;
  NDEFReader?: unknown;
  showOpenFilePicker?: unknown;
  print?: () => void;
  [key: string]: unknown;
}

export interface PlatformBridgeOptions {
  /** Optional host bridge key injected on `window` or `webkit.messageHandlers` (e.g. app-specific channel name). */
  nativeBridgeKey?: string;
  /** Global callback function name invoked by iOS `WKWebView.evaluateJavaScript(...)` replies. */
  iosStorageReplyGlobalKey?: string;
  /** Timeout in milliseconds for iOS WKWebView storage bridge round-trips (default: 5000). */
  iosStorageTimeoutMs?: number;
  /** Optional delegate for native binary export/share. */
  binaryExportHandler?: (options: PlatformExportOptions) => Promise<PlatformExportResult>;
  /** Optional delegate for native printing. */
  printHandler?: (options: PlatformPrintOptions) => Promise<boolean>;
  /** Optional delegate for opening external safe URLs. */
  externalUrlHandler?: (url: string, purpose?: string) => Promise<boolean> | boolean;
  /** Optional delegate for native persistent storage (used on iOS WKWebView / desktop containers). */
  storageBridgeHandler?: (
    operation: NativeStorageBridgeOperation
  ) => Promise<NativeStorageBridgeResult>;
}

interface PendingIosStorageRequest {
  resolve: (result: NativeStorageBridgeResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

function getHostGlobal(): HostGlobalScope | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  return globalThis as unknown as HostGlobalScope;
}

function hasMethod(target: unknown, methodName: string): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const candidate = (target as Record<string, unknown>)[methodName];
  return typeof candidate === 'function';
}

function getAndroidBridgeTarget(
  host: HostGlobalScope | undefined,
  nativeBridgeKey?: string
): NativePostMessageTarget | null {
  if (!host) return null;
  if (hasMethod(host.AndroidBridge, 'postMessage')) {
    return host.AndroidBridge!;
  }
  if (nativeBridgeKey && hasMethod(host[nativeBridgeKey], 'postMessage')) {
    return host[nativeBridgeKey] as NativePostMessageTarget;
  }
  return null;
}

function probeAndroidBridge(host: HostGlobalScope | undefined, nativeBridgeKey?: string): boolean {
  return getAndroidBridgeTarget(host, nativeBridgeKey) !== null;
}

function probeIosMessageHandler(
  host: HostGlobalScope | undefined,
  nativeBridgeKey?: string
): WebKitMessageHandler | null {
  const handlers = host?.webkit?.messageHandlers;
  if (!handlers || typeof handlers !== 'object') {
    return null;
  }
  const preferredKeys = nativeBridgeKey
    ? [nativeBridgeKey, 'nativeStorage', 'appBridge']
    : ['nativeStorage', 'appBridge'];

  for (const key of preferredKeys) {
    const handler = handlers[key];
    if (handler && typeof handler.postMessage === 'function') {
      return handler;
    }
  }
  const availableKeys = Object.keys(handlers);
  for (const key of availableKeys) {
    const handler = handlers[key];
    if (handler && typeof handler.postMessage === 'function') {
      return handler;
    }
  }
  return null;
}

function detectShellType(host: HostGlobalScope | undefined, nativeBridgeKey?: string): PlatformShellType {
  if (!host || typeof host.navigator === 'undefined') {
    return 'unknown';
  }
  const desktopShell = detectDesktopShellType(host);
  if (desktopShell) {
    return desktopShell;
  }
  if (probeAndroidBridge(host, nativeBridgeKey)) {
    return 'android-webview';
  }
  if (probeIosMessageHandler(host, nativeBridgeKey)) {
    return 'ios-wkwebview';
  }
  const ua = typeof host.navigator.userAgent === 'string' ? host.navigator.userAgent : '';
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//i.test(ua) && /AppleWebKit/i.test(ua)) {
    return 'ios-wkwebview';
  }
  if (typeof host.document === 'undefined') {
    return 'unknown';
  }
  return 'web-browser';
}

function safeCheckIndexedDb(host: HostGlobalScope | undefined): boolean {
  try {
    return Boolean(host?.indexedDB && typeof host.indexedDB.open === 'function');
  } catch {
    return false;
  }
}

function safeCheckOpfs(host: HostGlobalScope | undefined): boolean {
  try {
    const storage = host?.navigator?.storage;
    return Boolean(storage && typeof storage.getDirectory === 'function');
  } catch {
    return false;
  }
}

function safeCheckWebAssembly(host: HostGlobalScope | undefined): boolean {
  try {
    const wasm = host?.WebAssembly;
    return Boolean(wasm && typeof wasm.instantiate === 'function');
  } catch {
    return false;
  }
}

function safeCheckWorkers(host: HostGlobalScope | undefined): boolean {
  try {
    return typeof host?.Worker === 'function';
  } catch {
    return false;
  }
}

function safeCheckFileSystemAccess(host: HostGlobalScope | undefined): boolean {
  try {
    return typeof host?.showOpenFilePicker === 'function';
  } catch {
    return false;
  }
}

function safeCheckShareBinary(host: HostGlobalScope | undefined): boolean {
  try {
    const nav = host?.navigator;
    return Boolean(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function');
  } catch {
    return false;
  }
}

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function toArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) {
    return bytes;
  }
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function createBridgeRequestId(prefix: string): string {
  const randomPart = Math.floor(Math.random() * 1_000_000_000).toString(36);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function getSyncPlatformCapabilities(options?: PlatformBridgeOptions): PlatformCapabilities {
  const host = getHostGlobal();
  const shell = detectShellType(host, options?.nativeBridgeKey);
  const desktop = createDesktopBridgeDelegates(host);
  const hasNativeBridge =
    Boolean(options?.storageBridgeHandler) ||
    probeAndroidBridge(host, options?.nativeBridgeKey) ||
    Boolean(probeIosMessageHandler(host, options?.nativeBridgeKey)) ||
    shell === 'desktop-electron' ||
    shell === 'desktop-tauri';

  const supportsOpfs = safeCheckOpfs(host);
  const supportsIndexedDb = safeCheckIndexedDb(host);
  const supportsWebSqlite = safeCheckWebAssembly(host);
  const requiresIosStorageBridge = shell === 'ios-wkwebview';

  return {
    shell,
    hasNativeBridge,
    hasPersistentStorage: hasNativeBridge || supportsOpfs || supportsIndexedDb,
    requiresIosStorageBridge,
    supportsOpfs,
    supportsIndexedDb,
    supportsWebSqlite,
    supportsWebWorkers: safeCheckWorkers(host),
    canPrintDirect:
      hasNativeBridge ||
      Boolean(desktop?.hasPrintDocument) ||
      typeof host?.print === 'function',
    canShareBinary:
      hasNativeBridge ||
      Boolean(desktop?.hasBinaryExport) ||
      safeCheckShareBinary(host),
    canAccessFileSystem: safeCheckFileSystemAccess(host),
    hasHardwareBackNavigation:
      shell === 'android-webview' || shell === 'desktop-electron' || shell === 'desktop-tauri',
    hasNfc: Boolean(host && 'NDEFReader' in host),
  };
}

export async function detectPlatformCapabilities(
  options?: PlatformBridgeOptions
): Promise<PlatformCapabilities> {
  const base = getSyncPlatformCapabilities(options);
  const host = getHostGlobal();
  let persisted = base.hasPersistentStorage;

  try {
    const storage = host?.navigator?.storage;
    if (storage && typeof storage.persisted === 'function') {
      const confirmed = await storage.persisted();
      if (confirmed) {
        persisted = true;
      }
    }
  } catch {
    // Ignore restricted StorageManager access
  }

  return {
    ...base,
    hasPersistentStorage: base.hasNativeBridge || persisted,
  };
}

export class PlatformBridge implements IPlatformBridge {
  public readonly shellType: PlatformShellType;
  private readonly options: PlatformBridgeOptions;
  private cachedCapabilities: PlatformCapabilities;
  private readonly backHandlers: Array<{ id: number; priority: number; handler: PlatformBackHandler }> = [];
  private nextBackId = 1;
  private readonly diagnostics: PlatformDiagnosticEvent[] = [];
  private readonly pendingStorageRequests = new Map<string, PendingIosStorageRequest>();
  private readonly iosReplyGlobalKey: string;
  private iosReceiverAttached = false;
  private desktopBackUnsubscribe: (() => void) | null = null;

  constructor(options: PlatformBridgeOptions = {}) {
    this.options = options;
    this.iosReplyGlobalKey = options.iosStorageReplyGlobalKey || DEFAULT_IOS_STORAGE_REPLY_GLOBAL;
    this.cachedCapabilities = getSyncPlatformCapabilities(options);
    this.shellType = this.cachedCapabilities.shell;
  }

  public async detectCapabilities(): Promise<PlatformCapabilities> {
    this.cachedCapabilities = await detectPlatformCapabilities(this.options);
    return this.cachedCapabilities;
  }

  public getCapabilities(): PlatformCapabilities {
    return this.cachedCapabilities;
  }

  public async exportBinary(options: PlatformExportOptions): Promise<PlatformExportResult> {
    if (this.options.binaryExportHandler) {
      try {
        return await this.options.binaryExportHandler(options);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Native binary export failed';
        this.logDiagnostic('error', 'NATIVE_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    const host = getHostGlobal();
    const desktop = createDesktopBridgeDelegates(host);
    if (desktop?.exportBinary) {
      try {
        return await desktop.exportBinary(options);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Desktop binary export failed';
        this.logDiagnostic('error', 'DESKTOP_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    const bytes = toUint8Array(options.bytes);
    const androidTarget = getAndroidBridgeTarget(host, this.options.nativeBridgeKey);
    if (androidTarget) {
      const requestId = createBridgeRequestId('bin');
      try {
        androidTarget.postMessage(
          JSON.stringify({
            type: 'BEGIN_BINARY_TRANSFER',
            requestId,
            payload: {
              filename: options.filename,
              mimeType: options.mimeType,
              mode: options.mode,
              byteLength: bytes.byteLength,
            },
          })
        );
        try {
          androidTarget.postMessage(toArrayBuffer(bytes));
        } catch {
          androidTarget.postMessage(
            JSON.stringify({
              type: 'BEGIN_BINARY_TRANSFER',
              requestId,
              payload: {
                filename: options.filename,
                mimeType: options.mimeType,
                mode: options.mode,
                byteLength: bytes.byteLength,
                base64Data: bytesToBase64Pure(bytes),
              },
            })
          );
        }
        return { ok: true, handledBy: 'native-android' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Android binary export failed';
        this.logDiagnostic('error', 'ANDROID_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    const buffer = toArrayBuffer(bytes);
    if (
      options.mode === 'share' &&
      host?.navigator &&
      typeof host.navigator.share === 'function' &&
      typeof File !== 'undefined'
    ) {
      try {
        const file = new File([buffer], options.filename, { type: options.mimeType });
        const canShare =
          typeof host.navigator.canShare !== 'function' ||
          host.navigator.canShare({ files: [file] });
        if (canShare) {
          await host.navigator.share({ files: [file], title: options.filename });
          return { ok: true, handledBy: 'web-share' };
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, handledBy: 'web-share', error: 'Share canceled by user' };
        }
        this.logDiagnostic('warn', 'WEB_SHARE_FALLBACK', 'Falling back to blob download');
      }
    }

    if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
      try {
        const blob = new Blob([buffer], { type: options.mimeType });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = options.filename;
        anchor.style.display = 'none';
        if (document.body) {
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        } else {
          anchor.click();
        }
        setTimeout(() => {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // Ignore cleanup failure
          }
        }, 5000);
        return { ok: true, handledBy: 'web-download' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Blob download failed';
        this.logDiagnostic('error', 'WEB_DOWNLOAD_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    return { ok: false, handledBy: 'error', error: 'Export APIs unavailable in current runtime' };
  }

  public async printDocument(options: PlatformPrintOptions): Promise<boolean> {
    if (this.options.printHandler) {
      try {
        return await this.options.printHandler(options);
      } catch (err) {
        this.logDiagnostic(
          'error',
          'NATIVE_PRINT_FAILED',
          err instanceof Error ? err.message : 'Native print handler failed'
        );
        return false;
      }
    }

    const host = getHostGlobal();
    const desktop = createDesktopBridgeDelegates(host);
    if (desktop?.printDocument) {
      try {
        return await desktop.printDocument(options);
      } catch (err) {
        this.logDiagnostic(
          'error',
          'DESKTOP_PRINT_FAILED',
          err instanceof Error ? err.message : 'Desktop print handler failed'
        );
        return false;
      }
    }

    const androidTarget = getAndroidBridgeTarget(host, this.options.nativeBridgeKey);
    if (androidTarget) {
      try {
        androidTarget.postMessage(
          JSON.stringify({
            type: 'REQUEST_PRINT',
            requestId: createBridgeRequestId('print'),
            payload: {
              ...(options.title ? { title: options.title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160) } : {}),
              ...(options.orientation ? { orientation: options.orientation } : {}),
              ...(options.htmlContent ? { htmlContent: options.htmlContent } : {}),
            },
          })
        );
        return true;
      } catch (err) {
        this.logDiagnostic(
          'error',
          'ANDROID_PRINT_FAILED',
          err instanceof Error ? err.message : 'Android print postMessage failed'
        );
        return false;
      }
    }

    if (host && typeof host.print === 'function') {
      host.print();
      return true;
    }
    return false;
  }

  public async openExternalUrl(url: string, purpose?: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logDiagnostic('warn', 'BLOCKED_MALFORMED_URL', 'Rejected malformed external URL');
      return false;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
      this.logDiagnostic(
        'warn',
        'BLOCKED_UNSAFE_URL_SCHEME',
        `Blocked external URL with disallowed protocol: ${parsed.protocol}`
      );
      return false;
    }

    if (this.options.externalUrlHandler) {
      return await this.options.externalUrlHandler(parsed.href, purpose);
    }

    const host = getHostGlobal();
    const desktop = createDesktopBridgeDelegates(host);
    if (desktop?.openExternalUrl) {
      try {
        return await desktop.openExternalUrl(parsed.href);
      } catch {
        return false;
      }
    }

    const androidTarget = getAndroidBridgeTarget(host, this.options.nativeBridgeKey);
    if (androidTarget) {
      try {
        androidTarget.postMessage(
          JSON.stringify({
            type: 'OPEN_EXTERNAL_URL',
            requestId: createBridgeRequestId('ext'),
            payload: {
              url: parsed.href,
              protocol: parsed.protocol,
              purpose: purpose || 'external',
            },
          })
        );
        return true;
      } catch {
        return false;
      }
    }

    if (!host || typeof document === 'undefined') {
      return false;
    }
    if (parsed.protocol === 'mailto:' && host.location) {
      host.location.href = parsed.href;
      return true;
    }
    const anchor = document.createElement('a');
    anchor.href = parsed.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    if (document.body) {
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } else {
      anchor.click();
    }
    return true;
  }

  public registerBackHandler(handler: PlatformBackHandler, priority = 0): () => void {
    const id = this.nextBackId++;
    this.backHandlers.push({ id, priority, handler });
    if (!this.desktopBackUnsubscribe) {
      const desktop = createDesktopBridgeDelegates(getHostGlobal());
      if (desktop?.subscribeBackPressed) {
        this.desktopBackUnsubscribe = desktop.subscribeBackPressed(() => {
          void this.dispatchBackPress();
        });
      }
    }
    return () => {
      const idx = this.backHandlers.findIndex((entry) => entry.id === id);
      if (idx !== -1) {
        this.backHandlers.splice(idx, 1);
      }
    };
  }

  public async dispatchBackPress(): Promise<boolean> {
    const ordered = this.backHandlers
      .slice()
      .sort((a, b) => (b.priority !== a.priority ? b.priority - a.priority : b.id - a.id));

    for (let i = 0; i < ordered.length; i += 1) {
      try {
        const handled = await ordered[i].handler();
        if (handled) {
          return true;
        }
      } catch (err) {
        this.logDiagnostic(
          'error',
          'BACK_HANDLER_ERROR',
          err instanceof Error ? err.message : 'Back handler threw an error'
        );
      }
    }
    return false;
  }

  public handleStorageBridgeResponse(rawMessage: unknown): boolean {
    let parsed: unknown = rawMessage;
    if (typeof rawMessage === 'string') {
      try {
        parsed = JSON.parse(rawMessage);
      } catch {
        return false;
      }
    }
    if (!parsed || typeof parsed !== 'object') {
      return false;
    }
    const candidate = parsed as Partial<NativeStorageBridgeResult> & {
      type?: unknown;
      payload?: Partial<NativeStorageBridgeResult>;
    };

    const requestId =
      typeof candidate.requestId === 'string'
        ? candidate.requestId
        : typeof candidate.payload?.requestId === 'string'
          ? candidate.payload.requestId
          : undefined;
    if (!requestId) {
      return false;
    }
    const pending = this.pendingStorageRequests.get(requestId);
    if (!pending) {
      return false;
    }
    clearTimeout(pending.timer);
    this.pendingStorageRequests.delete(requestId);

    const source = candidate.payload && typeof candidate.payload === 'object' ? candidate.payload : candidate;
    pending.resolve({
      ok: Boolean(source.ok),
      requestId,
      ...(source.data !== undefined ? { data: source.data } : {}),
      ...(typeof source.error === 'string' ? { error: source.error } : {}),
    });
    return true;
  }

  private ensureIosStorageReceiverAttached(host: HostGlobalScope | undefined): void {
    if (!host || this.iosReceiverAttached) return;
    host[this.iosReplyGlobalKey] = (message: unknown) => {
      this.handleStorageBridgeResponse(message);
    };
    this.iosReceiverAttached = true;
  }

  public async invokeStorageBridge(
    operation: NativeStorageBridgeOperation
  ): Promise<NativeStorageBridgeResult> {
    if (this.options.storageBridgeHandler) {
      try {
        return await this.options.storageBridgeHandler(operation);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Storage bridge handler failed';
        this.logDiagnostic('error', 'STORAGE_BRIDGE_ERROR', message);
        return { ok: false, error: message };
      }
    }

    const host = getHostGlobal();
    const desktop = createDesktopBridgeDelegates(host);
    if (desktop?.invokeStorageBridge) {
      try {
        return await desktop.invokeStorageBridge(operation);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Desktop storage bridge failed';
        this.logDiagnostic('error', 'DESKTOP_STORAGE_BRIDGE_ERROR', message);
        return { ok: false, error: message };
      }
    }

    const iosHandler = probeIosMessageHandler(host, this.options.nativeBridgeKey);
    if (iosHandler) {
      this.ensureIosStorageReceiverAttached(host);
      const requestId = operation.requestId || createBridgeRequestId('ios_storage');
      const timeoutMs =
        this.options.iosStorageTimeoutMs && this.options.iosStorageTimeoutMs > 0
          ? this.options.iosStorageTimeoutMs
          : DEFAULT_IOS_STORAGE_TIMEOUT_MS;

      const serializedOperation =
        operation.data instanceof Uint8Array
          ? {
              ...operation,
              data: bytesToBase64Pure(operation.data),
              options: { ...(operation.options || {}), dataEncoding: 'base64' },
            }
          : operation;

      return new Promise<NativeStorageBridgeResult>((resolve) => {
        const timer = setTimeout(() => {
          this.pendingStorageRequests.delete(requestId);
          this.logDiagnostic(
            'error',
            'IOS_STORAGE_BRIDGE_TIMEOUT',
            `iOS native storage operation "${operation.action}" timed out after ${timeoutMs}ms`
          );
          resolve({
            ok: false,
            requestId,
            error: `iOS native storage bridge timed out after ${timeoutMs}ms`,
          });
        }, timeoutMs);

        this.pendingStorageRequests.set(requestId, { resolve, timer });

        try {
          iosHandler.postMessage({
            type: 'NATIVE_STORAGE_OP',
            requestId,
            replyGlobal: this.iosReplyGlobalKey,
            payload: serializedOperation,
          });
        } catch (err) {
          clearTimeout(timer);
          this.pendingStorageRequests.delete(requestId);
          const message =
            err instanceof Error ? err.message : 'iOS storage bridge postMessage failed';
          this.logDiagnostic('error', 'IOS_STORAGE_BRIDGE_ERROR', message);
          resolve({ ok: false, requestId, error: message });
        }
      });
    }

    return {
      ok: false,
      error: 'Native storage bridge is not configured in this environment',
    };
  }

  public logDiagnostic(
    level: 'info' | 'warn' | 'error',
    code: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    this.diagnostics.push({
      timestamp: new Date().toISOString(),
      level,
      code,
      message,
      ...(meta ? { meta } : {}),
    });
    if (this.diagnostics.length > 50) {
      this.diagnostics.shift();
    }
  }

  public getDiagnostics(): PlatformDiagnosticEvent[] {
    return this.diagnostics.slice();
  }

  public destroy(): void {
    this.pendingStorageRequests.forEach((entry, requestId) => {
      clearTimeout(entry.timer);
      entry.resolve({
        ok: false,
        requestId,
        error: 'PlatformBridge destroyed before native reply completed',
      });
    });
    this.pendingStorageRequests.clear();

    const host = getHostGlobal();
    if (this.iosReceiverAttached && host && host[this.iosReplyGlobalKey]) {
      delete host[this.iosReplyGlobalKey];
    }
    if (this.desktopBackUnsubscribe) {
      try {
        this.desktopBackUnsubscribe();
      } catch {
        // Ignore host teardown error
      }
      this.desktopBackUnsubscribe = null;
    }
    this.iosReceiverAttached = false;
    this.backHandlers.length = 0;
  }
}

export function createPlatformBridge(options?: PlatformBridgeOptions): PlatformBridge {
  return new PlatformBridge(options);
}
