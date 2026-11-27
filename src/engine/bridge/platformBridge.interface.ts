/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Platform Bridge & Capability Interface (`@engine/bridge/platformBridge.interface.ts`).
 *
 * Architectural Invariant:
 * Pure content-agnostic TypeScript contract with zero domain terms.
 * Defines platform detection, hardware bridges, native container capabilities,
 * and fallback behavior across standard browsers, Android WebView wrappers,
 * and future Apple/desktop shells.
 */

export type PlatformShellType =
  | 'web-browser'
  | 'android-webview'
  | 'ios-wkwebview'
  | 'desktop-electron'
  | 'desktop-tauri'
  | 'unknown';

export interface PlatformCapabilities {
  /** Detected runtime host container or browser */
  shell: PlatformShellType;
  /** Whether a native host communication bridge is mounted (e.g. window.AndroidBridge or WebKit message handlers) */
  hasNativeBridge: boolean;
  /** Whether durable, non-evictable storage is confirmed */
  hasPersistentStorage: boolean;
  /**
   * Whether the host environment requires storage to be routed through a native bridge
   * to bypass evictable browser storage.
   *
   * On iOS / WebKit, browser storage (IndexedDB, localStorage) is subject to automatic
   * 7-day eviction under Intelligent Tracking Prevention (ITP) and OS memory pressure.
   * When true, persistence MUST be delegated to the native host container.
   */
  requiresIosStorageBridge: boolean;
  /** Whether Origin Private File System (OPFS) is supported */
  supportsOpfs: boolean;
  /** Whether IndexedDB is available and functional */
  supportsIndexedDb: boolean;
  /** Whether WebAssembly SQLite execution is supported */
  supportsWebSqlite: boolean;
  /** Whether dedicated background Web Workers can be instantiated */
  supportsWebWorkers: boolean;
  /** Whether the platform can print directly via system spooler or native print bridge */
  canPrintDirect: boolean;
  /** Whether binary data can be shared via native OS share sheet */
  canShareBinary: boolean;
  /** Whether File System Access API (showOpenFilePicker / showSaveFilePicker) is supported */
  canAccessFileSystem: boolean;
  /** Whether hardware or container back navigation interception is active */
  hasHardwareBackNavigation: boolean;
  /** Whether Web NFC or native NFC bridge is supported */
  hasNfc: boolean;
}

export interface PlatformExportOptions {
  filename: string;
  mimeType: string;
  mode: 'save' | 'share';
  bytes: Uint8Array | ArrayBuffer;
}

export interface PlatformExportResult {
  ok: boolean;
  handledBy: 'native-android' | 'native-ios' | 'native-desktop' | 'web-share' | 'web-download' | 'error';
  error?: string;
}

export interface PlatformPrintOptions {
  title?: string;
  htmlContent: string;
  orientation?: 'portrait' | 'landscape';
}

export interface NativeStorageBridgeOperation {
  action: 'read' | 'write' | 'delete' | 'list' | 'vaultSnapshot';
  key?: string;
  data?: Uint8Array | string;
  options?: Record<string, unknown>;
  requestId?: string;
}

export interface NativeStorageBridgeResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

export type PlatformBackHandler = () => boolean | Promise<boolean>;

export interface PlatformDiagnosticEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface PlatformContainerInfo {
  platform?: string;
  appVersionName?: string;
  appVersionCode?: number;
  webViewPackage?: string;
  webViewVersion?: string;
  webViewMajorVersion?: number;
  opfsSupportedInWebView?: boolean;
  storageAvailableBytes?: number;
  storageTotalBytes?: number;
  vaultSnapshotCount?: number;
  vaultTotalBytes?: number;
  lastVaultBackupAt?: string | null;
}

/**
 * Universal Platform Bridge and Capability Provider Contract.
 */
export interface IPlatformBridge {
  /** The identified shell environment */
  readonly shellType: PlatformShellType;

  /** Probes and resolves full runtime capability matrix */
  detectCapabilities(): Promise<PlatformCapabilities>;

  /** Returns cached capability matrix (or synchronously detectable subset) */
  getCapabilities(): PlatformCapabilities;

  /** Dispatches binary file export to native handler or browser download */
  exportBinary(options: PlatformExportOptions): Promise<PlatformExportResult>;

  /** Dispatches document to system print spooler or native print bridge */
  printDocument(options: PlatformPrintOptions): Promise<boolean>;

  /** Opens an external safe URL (`https:` or `mailto:`) outside embedded containers */
  openExternalUrl?(url: string, purpose?: string): Promise<boolean> | boolean;

  /**
   * Registers a hardware back-button handler (Android / desktop).
   * Higher priority executes first; same priority executes LIFO.
   * Returns an unregister function.
   */
  registerBackHandler(handler: PlatformBackHandler, priority?: number): () => void;

  /**
   * Invokes persistent host storage via native bridge.
   * Required for iOS / WKWebView containers to bypass 7-day WebKit storage eviction.
   */
  invokeStorageBridge?(operation: NativeStorageBridgeOperation): Promise<NativeStorageBridgeResult>;

  /** Emits a diagnostic log entry to the platform ring buffer or developer console */
  logDiagnostic(level: 'info' | 'warn' | 'error', code: string, message: string, meta?: Record<string, unknown>): void;

  /** Returns buffered platform diagnostic events when supported */
  getDiagnosticEvents?(): PlatformDiagnosticEvent[];

  /** Subscribes to newly emitted platform diagnostic events; returns an unsubscribe function */
  onDiagnostic?(listener: (event: PlatformDiagnosticEvent) => void): () => void;

  /** Opens the host container's native diagnostics / developer panel when supported */
  openDevPanel?(): boolean;

  /** Queries native container runtime/storage metadata when running inside a wrapped shell */
  getContainerInfo?(timeoutMs?: number): Promise<PlatformContainerInfo | null>;
}
