/**
 * Community Pedigree — Native Wrapper Bridge
 * Copyright (C) 2026 Community Pedigree Contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * @module pedigreeBridge
 * @description
 * Zero-dependency, ES2018-compatible bridge connecting a web PWA to the native
 * Android WebView shell (`window.pedigreeNative` via AndroidX `WebMessageListener`)
 * or a future iOS `WKWebView` host (`window.webkit.messageHandlers.pedigreeNative`).
 *
 * When running in a standard desktop or mobile browser (`getPlatform() === 'web'`),
 * every method falls back cleanly to standard Web APIs (`window.print()`,
 * `navigator.share()`, Blob downloads, `popstate`, or safe no-ops) so the same
 * codebase runs identically wrapped or unwrapped.
 */

/** Runtime container platform detected by {@link PedigreeBridge.getPlatform}. */
export type NativePlatform = 'android' | 'ios' | 'web';

/**
 * Standard JSON control envelope exchanged across the WebView bridge.
 * Request/reply pairs (such as `NATIVE_BACK` / `NATIVE_BACK_RESULT` and
 * `GET_CONTAINER_INFO` / `CONTAINER_INFO_RESULT`) correlate via `requestId`.
 */
export interface NativeEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  /** Message discriminator (e.g. `'BEGIN_BINARY_TRANSFER'`, `'NATIVE_BACK'`). */
  type: string;
  /** Optional correlation ID for request/reply envelopes. */
  requestId?: string;
  /** Optional structured JSON payload. */
  payload?: TPayload;
}

/**
 * Honest container, WebView, and backup-vault metadata reported by the native shell
 * in response to `GET_CONTAINER_INFO`.
 */
export interface NativeContainerInfo {
  platform: NativePlatform;
  appVersion?: string;
  webViewPackage?: string;
  webViewVersion?: string;
  /** Major Chromium version of the installed System WebView (OPFS requires >= 109). */
  webViewMajorVersion?: number;
  /** `false` on WebView < 109 where Origin Private File System is unavailable. */
  opfsSupportedInWebView?: boolean;
  /** Origin currently allowed by the WebMessageListener (e.g. `https://appassets.androidplatform.net`). */
  origin?: string;
  isDebugBuild?: boolean;
  /** Number of backup snapshots currently retained in `filesDir/pedigree-vault/`. */
  vaultSnapshotCount?: number;
  /** Combined size in bytes of retained native vault snapshots. */
  vaultTotalBytes?: number;
  /** ISO-8601 timestamp of the newest native vault backup, or `null` if none yet. */
  lastVaultBackupAt?: string | null;
  /** Read-only byte size of Chromium's `app_webview` directory (`-1` or omitted if pending). */
  appWebViewBytes?: number;
}

/** Options passed to {@link PedigreeBridge.exportOrShareBinary}. */
export interface BinaryExportOptions {
  /** Suggested filename (native side sanitizes directory separators and control characters). */
  filename: string;
  /** Standard MIME type (e.g. `'application/zip'`, `'application/json'`, `'application/pdf'`). */
  mimeType: string;
  /** `'save'` opens Android SAF (`ACTION_CREATE_DOCUMENT`); `'share'` opens Android Share Sheet (`FileProvider`). */
  mode: 'save' | 'share';
  /** Raw file bytes. Keep as `Uint8Array` or `ArrayBuffer` so no extra JSON encoding occurs on Android. */
  bytes: Uint8Array | ArrayBuffer;
}

/** Outcome returned by {@link PedigreeBridge.exportOrShareBinary}. */
export interface BinaryExportResult {
  ok: boolean;
  handledBy: 'android' | 'ios' | 'web-share' | 'web-download' | 'error';
  error?: string;
}

/** Snapshot payload mirrored to the native backup vault via {@link PedigreeBridge.syncBackupSnapshotToNative}. */
export interface BackupSnapshotInput {
  /** Identifier sanitized to `[A-Za-z0-9_-]` (max 48 chars) by `NativeBackupVault`. */
  snapshotId: string;
  /** ISO-8601 UTC timestamp string. */
  createdAt: string;
  /** File extension format stored in `filesDir/pedigree-vault/`. */
  format: 'json' | 'sqlite' | 'zip';
  /** Serialized snapshot bytes (native vault enforces a 16 MiB maximum). */
  bytes: Uint8Array | ArrayBuffer;
  metadata?: Record<string, unknown>;
}

/** Diagnostic event recorded locally inside the TypeScript bridge (e.g. blocked URLs or timeouts). */
export interface BridgeDiagnosticEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

/** Callback registered with {@link PedigreeBridge.registerBackHandler}. Return `true` if the back press was consumed. */
export type BackHandler = () => boolean | Promise<boolean>;
/** Subscriber notified whenever the bridge records a {@link BridgeDiagnosticEvent}. */
export type DiagnosticEventListener = (event: BridgeDiagnosticEvent) => void;

interface AndroidWebMessageEvent {
  data: unknown;
  origin?: string;
}

interface AndroidPedigreeNativeObject {
  postMessage: (message: string | ArrayBuffer) => void;
  onmessage?: ((event: AndroidWebMessageEvent) => void) | null;
  addEventListener?: (type: 'message', listener: (event: AndroidWebMessageEvent) => void) => void;
  removeEventListener?: (type: 'message', listener: (event: AndroidWebMessageEvent) => void) => void;
}

interface IosScriptMessageHandler {
  postMessage: (message: unknown) => void;
}

interface WindowWithNativeBridge extends Window {
  pedigreeNative?: AndroidPedigreeNativeObject;
  webkit?: {
    messageHandlers?: {
      pedigreeNative?: IosScriptMessageHandler;
      [key: string]: IosScriptMessageHandler | undefined;
    };
  };
  __pedigreeBridgeReceive?: (message: unknown) => void;
}

interface RegisteredBackEntry {
  id: number;
  priority: number;
  handler: BackHandler;
}

interface PendingRequest<T> {
  resolve: (value: T) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Default virtual HTTPS origin used by Android `WebViewAssetLoader`. */
export const ANDROID_ASSET_ORIGIN = 'https://appassets.androidplatform.net';

function getWindowRef(): WindowWithNativeBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window as WindowWithNativeBridge;
}

function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

/**
 * Extracts an exact-length `ArrayBuffer` for `postMessage`.
 * If `bytes` is a `subarray()` view into a larger backing buffer, `.slice(...)` prevents sending
 * unintended prefix/trailing bytes across the Android WebMessage bridge.
 */
function toSlicedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
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

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== 'function') {
    return '';
  }
  const chunkSize = 0x1000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(parts.join(''));
}

function createRequestId(prefix: string): string {
  const randomPart = Math.floor(Math.random() * 1000000000).toString(36);
  return prefix + '_' + Date.now().toString(36) + '_' + randomPart;
}

function parseEnvelope(raw: unknown): NativeEnvelope | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !candidate.type) {
    return null;
  }
  const envelope: NativeEnvelope = {
    type: candidate.type,
  };
  if (typeof candidate.requestId === 'string') {
    envelope.requestId = candidate.requestId;
  }
  if (typeof candidate.payload === 'object' && candidate.payload !== null) {
    envelope.payload = candidate.payload as Record<string, unknown>;
  }
  return envelope;
}

/**
 * Singleton-friendly native wrapper bridge with clean standard-browser fallbacks.
 * Prefer importing {@link pedigreeBridge} in app code or {@link createPedigreeBridge} in unit tests.
 */
export class PedigreeBridge {
  private backEntries: RegisteredBackEntry[] = [];
  private nextBackEntryId = 1;
  private pendingContainerInfo = new Map<string, PendingRequest<NativeContainerInfo | null>>();
  private pendingBlobRevokes = new Map<ReturnType<typeof setTimeout>, string>();
  private diagnosticListeners = new Set<DiagnosticEventListener>();
  private recentDiagnostics: BridgeDiagnosticEvent[] = [];
  private listenerAttached = false;
  private boundAndroidObject: AndroidPedigreeNativeObject | null = null;
  private boundMessageHandler: ((event: AndroidWebMessageEvent) => void) | null = null;

  constructor() {
    this.ensureListenersAttached();
  }

  /** Detects whether the app is running inside Android (`window.pedigreeNative`), iOS (`webkit.messageHandlers`), or a standard browser (`'web'`). */
  public getPlatform(): NativePlatform {
    const win = getWindowRef();
    if (!win) {
      return 'web';
    }
    if (win.pedigreeNative && typeof win.pedigreeNative.postMessage === 'function') {
      return 'android';
    }
    if (
      win.webkit &&
      win.webkit.messageHandlers &&
      win.webkit.messageHandlers.pedigreeNative &&
      typeof win.webkit.messageHandlers.pedigreeNative.postMessage === 'function'
    ) {
      return 'ios';
    }
    return 'web';
  }

  /** Returns `true` when running inside the Android or iOS native shell (`getPlatform() !== 'web'`). */
  public isNativeWrapper(): boolean {
    return this.getPlatform() !== 'web';
  }

  /** Returns the current page origin used to validate incoming `WebMessageCompat` events. */
  public getExpectedOrigin(): string {
    const win = getWindowRef();
    if (win && win.location && typeof win.location.origin === 'string' && win.location.origin !== 'null') {
      return win.location.origin;
    }
    return ANDROID_ASSET_ORIGIN;
  }

  /** Subscribes to bridge diagnostic events (e.g. blocked schemes, origin mismatches, timeouts). Returns an unsubscribe callback. */
  public onDiagnostic(listener: DiagnosticEventListener): () => void {
    this.diagnosticListeners.add(listener);
    return () => {
      this.diagnosticListeners.delete(listener);
    };
  }

  /** Returns a shallow copy of up to 50 recent bridge diagnostic events. */
  public getDiagnosticEvents(): BridgeDiagnosticEvent[] {
    return this.recentDiagnostics.slice();
  }

  /**
   * Registers a Back-press handler and returns an unregister function.
   *
   * Convention:
   * - Register route-level unwinding at `priority = 0`.
   * - Register modal/dialog close handlers at `priority >= 5` (e.g. `10`) so open dialogs
   *   always close before the underlying route steps back.
   * - Within equal priority, handlers run LIFO (most recently registered first).
   */
  public registerBackHandler(handler: BackHandler, priority = 0): () => void {
    this.ensureListenersAttached();
    const id = this.nextBackEntryId;
    this.nextBackEntryId += 1;
    const entry: RegisteredBackEntry = { id, priority, handler };
    this.backEntries.push(entry);

    return () => {
      this.backEntries = this.backEntries.filter(function (item) {
        return item.id !== id;
      });
    };
  }

  /** Evaluates registered Back handlers in priority-descending, LIFO order until one returns `true`. */
  public async dispatchBackPress(): Promise<boolean> {
    // Evaluate highest priority first; within same priority evaluate LIFO (most recently added first).
    const snapshot = this.backEntries.slice().sort(function (a, b) {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.id - a.id;
    });

    for (let i = 0; i < snapshot.length; i += 1) {
      try {
        const handled = await snapshot[i].handler();
        if (handled) {
          return true;
        }
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'BACK_HANDLER_ERROR',
          err instanceof Error ? err.message : 'Back handler threw an error'
        );
      }
    }
    return false;
  }

  /**
   * Exports or shares a binary payload (`Uint8Array` or `ArrayBuffer`).
   * - **Android**: sends `BEGIN_BINARY_TRANSFER` metadata followed immediately by the sliced `ArrayBuffer`
   *   so `FileAndExportBridge.kt` can launch SAF (`mode: 'save'`) or `FileProvider` Share (`mode: 'share'`).
   * - **iOS**: serializes as base64 in an `EXPORT_OR_SHARE_BINARY` envelope for `WKScriptMessageHandler`.
   * - **Web**: attempts `navigator.share({ files })` when `mode === 'share'`, falling back to a Blob `<a download>`.
   */
  public async exportOrShareBinary(options: BinaryExportOptions): Promise<BinaryExportResult> {
    this.ensureListenersAttached();
    const bytes = toUint8Array(options.bytes);
    const platform = this.getPlatform();
    const requestId = createRequestId('bin');

    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return { ok: false, handledBy: 'error', error: 'Android bridge unavailable' };
      }
      try {
        const metaEnvelope: NativeEnvelope = {
          type: 'BEGIN_BINARY_TRANSFER',
          requestId: requestId,
          payload: {
            filename: options.filename,
            mimeType: options.mimeType,
            mode: options.mode,
            byteLength: bytes.byteLength,
          },
        };
        androidObj.postMessage(JSON.stringify(metaEnvelope));
        androidObj.postMessage(toSlicedArrayBuffer(bytes));
        return { ok: true, handledBy: 'android' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to stream binary to Android';
        this.recordDiagnostic('error', 'ANDROID_BINARY_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    if (platform === 'ios') {
      const iosHandler = this.getIosHandler();
      if (!iosHandler) {
        return { ok: false, handledBy: 'error', error: 'iOS bridge unavailable' };
      }
      try {
        const envelope: NativeEnvelope = {
          type: 'EXPORT_OR_SHARE_BINARY',
          requestId: requestId,
          payload: {
            filename: options.filename,
            mimeType: options.mimeType,
            mode: options.mode,
            byteLength: bytes.byteLength,
            base64Data: uint8ArrayToBase64(bytes),
          },
        };
        iosHandler.postMessage(envelope);
        return { ok: true, handledBy: 'ios' };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send binary to iOS';
        this.recordDiagnostic('error', 'IOS_BINARY_EXPORT_FAILED', message);
        return { ok: false, handledBy: 'error', error: message };
      }
    }

    // Standard browser fallback
    const slicedBuffer = toSlicedArrayBuffer(bytes);
    if (
      options.mode === 'share' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof File !== 'undefined'
    ) {
      try {
        const file = new File([slicedBuffer], options.filename, { type: options.mimeType });
        const canShare =
          typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] });
        if (canShare) {
          await navigator.share({ files: [file], title: options.filename });
          return { ok: true, handledBy: 'web-share' };
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return { ok: false, handledBy: 'web-share', error: 'Share canceled by user' };
        }
        this.recordDiagnostic('warn', 'WEB_SHARE_FALLBACK', 'Falling back to blob download after share error');
      }
    }

    return this.triggerBrowserDownload(slicedBuffer, options.filename, options.mimeType);
  }

  /**
   * Triggers native printing / "Save as PDF" (`REQUEST_PRINT` on Android/iOS, `window.print()` on web).
   * Required because `window.print()` is a silent no-op inside Android `WebView`.
   */
  public requestPrint(): boolean {
    this.ensureListenersAttached();
    const platform = this.getPlatform();
    const requestId = createRequestId('print');

    if (platform !== 'web') {
      return this.postControlEnvelope({
        type: 'REQUEST_PRINT',
        requestId: requestId,
      });
    }

    const win = getWindowRef();
    if (win && typeof win.print === 'function') {
      win.print();
      return true;
    }
    return false;
  }

  /**
   * Safely opens an external `https:` or `mailto:` URL.
   * Rejects `http:`, `file:`, `javascript:`, `data:`, `blob:`, and malformed URLs (returning `false`).
   * On Android, routes `https:` to Custom Tabs and `mailto:` to `Intent.ACTION_SENDTO`.
   */
  public openExternalUrl(url: string, purpose?: string): boolean {
    this.ensureListenersAttached();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (_err) {
      this.recordDiagnostic('warn', 'BLOCKED_MALFORMED_URL', 'Rejected malformed external URL');
      return false;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
      this.recordDiagnostic(
        'warn',
        'BLOCKED_UNSAFE_URL_SCHEME',
        'Blocked external URL with disallowed protocol: ' + parsed.protocol
      );
      return false;
    }

    const platform = this.getPlatform();
    if (platform !== 'web') {
      return this.postControlEnvelope({
        type: 'OPEN_EXTERNAL_URL',
        requestId: createRequestId('ext'),
        payload: {
          url: parsed.href,
          protocol: parsed.protocol,
          purpose: purpose || 'external',
        },
      });
    }

    const win = getWindowRef();
    if (!win || typeof document === 'undefined') {
      return false;
    }

    if (parsed.protocol === 'mailto:') {
      win.location.href = parsed.href;
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

  /** Opens the native Android Developer & Diagnostics dialog (`false` when running in a standard browser). */
  public openNativeDevPanel(): boolean {
    this.ensureListenersAttached();
    if (!this.isNativeWrapper()) {
      return false;
    }
    return this.postControlEnvelope({
      type: 'OPEN_DEV_PANEL',
      requestId: createRequestId('dev'),
    });
  }

  /**
   * Queries native WebView runtime & backup vault metadata (`GET_CONTAINER_INFO`).
   * Resolves immediately to `null` in a standard browser or if the native reply exceeds `timeoutMs` (default 400ms).
   */
  public getNativeContainerInfo(timeoutMs = 400): Promise<NativeContainerInfo | null> {
    this.ensureListenersAttached();
    if (!this.isNativeWrapper()) {
      return Promise.resolve(null);
    }

    const requestId = createRequestId('info');
    return new Promise<NativeContainerInfo | null>((resolve) => {
      const effectiveTimeout = timeoutMs > 0 ? timeoutMs : 400;
      const timer = setTimeout(() => {
        this.pendingContainerInfo.delete(requestId);
        this.recordDiagnostic('warn', 'CONTAINER_INFO_TIMEOUT', 'Native container info request timed out');
        resolve(null);
      }, effectiveTimeout);

      this.pendingContainerInfo.set(requestId, { resolve, timer });

      const posted = this.postControlEnvelope({
        type: 'GET_CONTAINER_INFO',
        requestId: requestId,
      });

      if (!posted) {
        clearTimeout(timer);
        this.pendingContainerInfo.delete(requestId);
        resolve(null);
      }
    });
  }

  /**
   * Mirrors a serialized backup snapshot to `filesDir/pedigree-vault/` on Android (or iOS handler).
   * Keep payloads under 16 MiB; the native vault skips redundant writes via SHA-256 deduplication.
   */
  public syncBackupSnapshotToNative(snapshot: BackupSnapshotInput): Promise<boolean> {
    this.ensureListenersAttached();
    const platform = this.getPlatform();
    if (platform === 'web') {
      return Promise.resolve(false);
    }

    const bytes = toUint8Array(snapshot.bytes);
    const requestId = createRequestId('vault');

    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return Promise.resolve(false);
      }
      try {
        const envelope: NativeEnvelope = {
          type: 'SYNC_BACKUP_SNAPSHOT',
          requestId: requestId,
          payload: {
            snapshotId: snapshot.snapshotId,
            createdAt: snapshot.createdAt,
            format: snapshot.format,
            byteLength: bytes.byteLength,
            metadata: snapshot.metadata || {},
          },
        };
        androidObj.postMessage(JSON.stringify(envelope));
        androidObj.postMessage(toSlicedArrayBuffer(bytes));
        return Promise.resolve(true);
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'SYNC_SNAPSHOT_FAILED',
          err instanceof Error ? err.message : 'Failed to sync snapshot to Android vault'
        );
        return Promise.resolve(false);
      }
    }

    const iosHandler = this.getIosHandler();
    if (!iosHandler) {
      return Promise.resolve(false);
    }
    try {
      iosHandler.postMessage({
        type: 'SYNC_BACKUP_SNAPSHOT',
        requestId: requestId,
        payload: {
          snapshotId: snapshot.snapshotId,
          createdAt: snapshot.createdAt,
          format: snapshot.format,
          byteLength: bytes.byteLength,
          base64Data: uint8ArrayToBase64(bytes),
          metadata: snapshot.metadata || {},
        },
      });
      return Promise.resolve(true);
    } catch (err) {
      this.recordDiagnostic(
        'error',
        'IOS_SYNC_SNAPSHOT_FAILED',
        err instanceof Error ? err.message : 'Failed to sync snapshot to iOS'
      );
      return Promise.resolve(false);
    }
  }

  /**
   * Processes an incoming message from the native host, rejecting any event whose `origin`
   * does not match {@link getExpectedOrigin}.
   */
  public handleIncomingNativeMessage(rawData: unknown, origin?: string): void {
    if (origin && origin !== 'null' && origin !== this.getExpectedOrigin()) {
      this.recordDiagnostic(
        'warn',
        'REJECTED_UNTRUSTED_ORIGIN',
        'Ignored native message from unexpected origin: ' + origin
      );
      return;
    }

    const envelope = parseEnvelope(rawData);
    if (!envelope) {
      return;
    }

    if (envelope.type === 'NATIVE_BACK') {
      void this.respondToNativeBack(envelope.requestId);
      return;
    }

    if (envelope.type === 'CONTAINER_INFO_RESULT' && envelope.requestId) {
      const pending = this.pendingContainerInfo.get(envelope.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingContainerInfo.delete(envelope.requestId);
        pending.resolve(this.normalizeContainerInfo(envelope.payload));
      }
    }
  }

  /** Detaches listeners, cancels pending timers/requests, and revokes any unrevoked Blob URLs. */
  public destroy(): void {
    const win = getWindowRef();
    this.detachAndroidListener();
    if (win && win.__pedigreeBridgeReceive) {
      delete win.__pedigreeBridgeReceive;
    }
    this.pendingContainerInfo.forEach(function (entry) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    });
    this.pendingContainerInfo.clear();
    this.pendingBlobRevokes.forEach(function (objectUrl, timer) {
      clearTimeout(timer);
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    });
    this.pendingBlobRevokes.clear();
    this.backEntries = [];
    this.recentDiagnostics = [];
    this.diagnosticListeners.clear();
    this.listenerAttached = false;
  }

  private async respondToNativeBack(requestId?: string): Promise<void> {
    let handled = false;
    try {
      handled = await this.dispatchBackPress();
    } catch (_err) {
      handled = false;
    }
    if (this.isNativeWrapper()) {
      this.postControlEnvelope({
        type: 'NATIVE_BACK_RESULT',
        requestId: requestId,
        payload: { handled: handled },
      });
    }
  }

  private normalizeContainerInfo(payload?: Record<string, unknown>): NativeContainerInfo {
    const data = payload || {};
    const info: NativeContainerInfo = {
      platform:
        data.platform === 'android' || data.platform === 'ios' || data.platform === 'web'
          ? data.platform
          : this.getPlatform(),
    };
    if (typeof data.appVersion === 'string') info.appVersion = data.appVersion;
    if (typeof data.webViewPackage === 'string') info.webViewPackage = data.webViewPackage;
    if (typeof data.webViewVersion === 'string') info.webViewVersion = data.webViewVersion;
    if (typeof data.webViewMajorVersion === 'number') info.webViewMajorVersion = data.webViewMajorVersion;
    if (typeof data.opfsSupportedInWebView === 'boolean') info.opfsSupportedInWebView = data.opfsSupportedInWebView;
    if (typeof data.origin === 'string') info.origin = data.origin;
    if (typeof data.isDebugBuild === 'boolean') info.isDebugBuild = data.isDebugBuild;
    if (typeof data.vaultSnapshotCount === 'number') info.vaultSnapshotCount = data.vaultSnapshotCount;
    if (typeof data.vaultTotalBytes === 'number') info.vaultTotalBytes = data.vaultTotalBytes;
    if (typeof data.lastVaultBackupAt === 'string' || data.lastVaultBackupAt === null) {
      info.lastVaultBackupAt = data.lastVaultBackupAt;
    }
    if (typeof data.appWebViewBytes === 'number') info.appWebViewBytes = data.appWebViewBytes;
    return info;
  }

  private ensureListenersAttached(): void {
    const win = getWindowRef();
    if (!win) {
      return;
    }

    if (!this.listenerAttached) {
      win.__pedigreeBridgeReceive = (message: unknown) => {
        this.handleIncomingNativeMessage(message);
      };
      this.listenerAttached = true;
    }

    const androidObj = this.getAndroidObject();
    if (androidObj && androidObj !== this.boundAndroidObject) {
      this.detachAndroidListener();
      const handler = (event: AndroidWebMessageEvent) => {
        this.handleIncomingNativeMessage(event ? event.data : undefined, event ? event.origin : undefined);
      };
      if (typeof androidObj.addEventListener === 'function') {
        androidObj.addEventListener('message', handler);
      } else {
        androidObj.onmessage = handler;
      }
      this.boundAndroidObject = androidObj;
      this.boundMessageHandler = handler;
    }
  }

  private detachAndroidListener(): void {
    if (this.boundAndroidObject && this.boundMessageHandler) {
      if (typeof this.boundAndroidObject.removeEventListener === 'function') {
        this.boundAndroidObject.removeEventListener('message', this.boundMessageHandler);
      } else if (this.boundAndroidObject.onmessage === this.boundMessageHandler) {
        this.boundAndroidObject.onmessage = null;
      }
    }
    this.boundAndroidObject = null;
    this.boundMessageHandler = null;
  }

  private getAndroidObject(): AndroidPedigreeNativeObject | null {
    const win = getWindowRef();
    if (win && win.pedigreeNative && typeof win.pedigreeNative.postMessage === 'function') {
      return win.pedigreeNative;
    }
    return null;
  }

  private getIosHandler(): IosScriptMessageHandler | null {
    const win = getWindowRef();
    if (
      win &&
      win.webkit &&
      win.webkit.messageHandlers &&
      win.webkit.messageHandlers.pedigreeNative &&
      typeof win.webkit.messageHandlers.pedigreeNative.postMessage === 'function'
    ) {
      return win.webkit.messageHandlers.pedigreeNative;
    }
    return null;
  }

  private postControlEnvelope(envelope: NativeEnvelope): boolean {
    const platform = this.getPlatform();
    if (platform === 'android') {
      const androidObj = this.getAndroidObject();
      if (!androidObj) {
        return false;
      }
      try {
        androidObj.postMessage(JSON.stringify(envelope));
        return true;
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'ANDROID_POST_MESSAGE_FAILED',
          err instanceof Error ? err.message : 'Failed posting message to Android'
        );
        return false;
      }
    }

    if (platform === 'ios') {
      const iosHandler = this.getIosHandler();
      if (!iosHandler) {
        return false;
      }
      try {
        iosHandler.postMessage(envelope);
        return true;
      } catch (err) {
        this.recordDiagnostic(
          'error',
          'IOS_POST_MESSAGE_FAILED',
          err instanceof Error ? err.message : 'Failed posting message to iOS'
        );
        return false;
      }
    }

    return false;
  }

  private triggerBrowserDownload(
    buffer: ArrayBuffer,
    filename: string,
    mimeType: string
  ): BinaryExportResult {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
      return { ok: false, handledBy: 'error', error: 'Browser download APIs unavailable' };
    }
    try {
      const blob = new Blob([buffer], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      if (document.body) {
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      } else {
        anchor.click();
      }
      const self = this;
      const revokeTimer = setTimeout(function () {
        self.pendingBlobRevokes.delete(revokeTimer);
        URL.revokeObjectURL(objectUrl);
      }, 10000);
      this.pendingBlobRevokes.set(revokeTimer, objectUrl);
      return { ok: true, handledBy: 'web-download' };
    } catch (err) {
      return {
        ok: false,
        handledBy: 'error',
        error: err instanceof Error ? err.message : 'Browser download failed',
      };
    }
  }

  private recordDiagnostic(
    level: 'info' | 'warn' | 'error',
    code: string,
    message: string
  ): void {
    const entry: BridgeDiagnosticEvent = {
      timestamp: new Date().toISOString(),
      level: level,
      code: code,
      message: message,
    };
    this.recentDiagnostics.push(entry);
    if (this.recentDiagnostics.length > 50) {
      this.recentDiagnostics.shift();
    }
    this.diagnosticListeners.forEach(function (listener) {
      try {
        listener(entry);
      } catch (_err) {
        // Ignore listener errors
      }
    });
  }
}

/** Creates an isolated {@link PedigreeBridge} instance (primarily for unit tests). */
export function createPedigreeBridge(): PedigreeBridge {
  return new PedigreeBridge();
}

/** Shared singleton bridge instance used across the wrapped PWA. */
export const pedigreeBridge = createPedigreeBridge();
