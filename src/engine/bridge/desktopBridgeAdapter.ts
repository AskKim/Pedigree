/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Desktop Shell Bridge Adapter (Electron / Tauri)
 * (`@engine/bridge/desktopBridgeAdapter.ts`).
 *
 * Detects injected `window.electronAPI` or `window.__TAURI_INTERNALS__` / `window.__TAURI__`
 * at runtime without adding any `electron` or `@tauri-apps/*` package dependencies.
 */

import { bytesToBase64Pure } from '../binaryEncoding';
import type {
  NativeStorageBridgeOperation,
  NativeStorageBridgeResult,
  PlatformExportOptions,
  PlatformExportResult,
  PlatformPrintOptions,
  PlatformShellType,
} from './platformBridge.interface';

export interface ElectronApiLike {
  exportBinary?: (payload: {
    filename: string;
    mimeType: string;
    mode: 'save' | 'share';
    base64Data: string;
    byteLength: number;
  }) => Promise<boolean | PlatformExportResult>;
  printDocument?: (options: PlatformPrintOptions) => Promise<boolean>;
  invokeStorageBridge?: (
    operation: NativeStorageBridgeOperation
  ) => Promise<NativeStorageBridgeResult>;
  openExternal?: (url: string) => Promise<boolean> | boolean;
  onBackPressed?: (handler: () => void) => () => void;
}

export interface TauriInvokeContainer {
  invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

export interface DesktopHostLike {
  electronAPI?: ElectronApiLike;
  __TAURI_INTERNALS__?: TauriInvokeContainer;
  __TAURI__?: {
    core?: TauriInvokeContainer;
    invoke?: TauriInvokeContainer['invoke'];
  };
}

export interface DesktopBridgeDelegates {
  shell: Extract<PlatformShellType, 'desktop-electron' | 'desktop-tauri'>;
  hasBinaryExport: boolean;
  hasPrintDocument: boolean;
  hasStorageBridge: boolean;
  exportBinary?: (options: PlatformExportOptions) => Promise<PlatformExportResult>;
  printDocument?: (options: PlatformPrintOptions) => Promise<boolean>;
  invokeStorageBridge?: (
    operation: NativeStorageBridgeOperation
  ) => Promise<NativeStorageBridgeResult>;
  openExternalUrl?: (url: string) => Promise<boolean>;
  subscribeBackPressed?: (handler: () => void) => () => void;
}

function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function getTauriInvokeFn(
  host: DesktopHostLike | undefined
): TauriInvokeContainer['invoke'] | null {
  if (!host) return null;
  if (typeof host.__TAURI_INTERNALS__?.invoke === 'function') {
    return host.__TAURI_INTERNALS__.invoke.bind(host.__TAURI_INTERNALS__);
  }
  if (typeof host.__TAURI__?.core?.invoke === 'function') {
    return host.__TAURI__.core.invoke.bind(host.__TAURI__.core);
  }
  if (typeof host.__TAURI__?.invoke === 'function') {
    return host.__TAURI__.invoke.bind(host.__TAURI__);
  }
  return null;
}

export function detectDesktopShellType(
  host: DesktopHostLike | undefined
): Extract<PlatformShellType, 'desktop-electron' | 'desktop-tauri'> | null {
  if (!host) return null;
  if (host.__TAURI_INTERNALS__ || host.__TAURI__) {
    return 'desktop-tauri';
  }
  if (host.electronAPI) {
    return 'desktop-electron';
  }
  return null;
}

export function createDesktopBridgeDelegates(
  host: DesktopHostLike | undefined
): DesktopBridgeDelegates | null {
  const shell = detectDesktopShellType(host);
  if (!shell || !host) {
    return null;
  }

  if (shell === 'desktop-electron' && host.electronAPI) {
    const api = host.electronAPI;
    return {
      shell: 'desktop-electron',
      hasBinaryExport: typeof api.exportBinary === 'function',
      hasPrintDocument: typeof api.printDocument === 'function',
      hasStorageBridge: typeof api.invokeStorageBridge === 'function',
      exportBinary:
        typeof api.exportBinary === 'function'
          ? async (options) => {
              const bytes = toUint8Array(options.bytes);
              const res = await api.exportBinary!({
                filename: options.filename,
                mimeType: options.mimeType,
                mode: options.mode,
                base64Data: bytesToBase64Pure(bytes),
                byteLength: bytes.byteLength,
              });
              if (typeof res === 'boolean') {
                return res
                  ? { ok: true, handledBy: 'native-desktop' }
                  : { ok: false, handledBy: 'error', error: 'Electron export returned false' };
              }
              return {
                ok: Boolean(res?.ok),
                handledBy: res?.ok ? 'native-desktop' : 'error',
                ...(res?.error ? { error: res.error } : {}),
              };
            }
          : undefined,
      printDocument:
        typeof api.printDocument === 'function'
          ? async (options) => Boolean(await api.printDocument!(options))
          : undefined,
      invokeStorageBridge:
        typeof api.invokeStorageBridge === 'function'
          ? async (operation) => {
              const payloadOp: NativeStorageBridgeOperation =
                operation.data instanceof Uint8Array
                  ? {
                      ...operation,
                      data: bytesToBase64Pure(operation.data),
                      options: { ...(operation.options || {}), dataEncoding: 'base64' },
                    }
                  : operation;
              return api.invokeStorageBridge!(payloadOp);
            }
          : undefined,
      openExternalUrl:
        typeof api.openExternal === 'function'
          ? async (url) => Boolean(await api.openExternal!(url))
          : undefined,
      subscribeBackPressed:
        typeof api.onBackPressed === 'function'
          ? (handler) => api.onBackPressed!(handler)
          : undefined,
    };
  }

  const invokeFn = getTauriInvokeFn(host);
  return {
    shell: 'desktop-tauri',
    hasBinaryExport: Boolean(invokeFn),
    hasPrintDocument: Boolean(invokeFn),
    hasStorageBridge: Boolean(invokeFn),
    exportBinary: invokeFn
      ? async (options) => {
          const bytes = toUint8Array(options.bytes);
          const result = await invokeFn<boolean | { ok?: boolean; error?: string }>(
            'bridge_export_binary',
            {
              filename: options.filename,
              mimeType: options.mimeType,
              mode: options.mode,
              base64Data: bytesToBase64Pure(bytes),
              byteLength: bytes.byteLength,
            }
          );
          if (typeof result === 'boolean') {
            return result
              ? { ok: true, handledBy: 'native-desktop' }
              : { ok: false, handledBy: 'error', error: 'Tauri export returned false' };
          }
          return {
            ok: Boolean(result?.ok ?? true),
            handledBy: result?.ok === false ? 'error' : 'native-desktop',
            ...(result?.error ? { error: result.error } : {}),
          };
        }
      : undefined,
    printDocument: invokeFn
      ? async (options) =>
          Boolean(
            await invokeFn<boolean>('bridge_print_document', {
              title: options.title,
              htmlContent: options.htmlContent,
              orientation: options.orientation,
            })
          )
      : undefined,
    invokeStorageBridge: invokeFn
      ? async (operation) => {
          const serializedData =
            operation.data instanceof Uint8Array
              ? bytesToBase64Pure(operation.data)
              : operation.data;
          return invokeFn<NativeStorageBridgeResult>('bridge_storage_op', {
            action: operation.action,
            key: operation.key,
            data: serializedData,
            options: operation.options,
          });
        }
      : undefined,
    openExternalUrl: invokeFn
      ? async (url) => Boolean(await invokeFn<boolean>('bridge_open_external', { url }))
      : undefined,
  };
}
