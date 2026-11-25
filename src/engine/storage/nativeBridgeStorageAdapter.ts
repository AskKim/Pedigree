/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Native Bridge Storage Adapter (`@engine/storage/nativeBridgeStorageAdapter.ts`).
 * Routes persistence through `IPlatformBridge.invokeStorageBridge(...)` so iOS WKWebView
 * and desktop native containers bypass evictable WebKit storage.
 */

import { base64ToBytesPure, bytesToBase64Pure, utf8StringToBytes } from '../binaryEncoding';
import type { IPlatformBridge } from '../bridge/platformBridge.interface';
import type {
  IStorageAdapter,
  StorageCapabilities,
  StorageFilterOptions,
  StorageQuotaInfo,
} from './storageAdapter.interface';

interface SerializedBridgeValue {
  encoding: 'utf8' | 'base64';
  payload: string;
}

function encodeBridgeValue(value: Uint8Array | string): string {
  const envelope: SerializedBridgeValue =
    typeof value === 'string'
      ? { encoding: 'utf8', payload: value }
      : { encoding: 'base64', payload: bytesToBase64Pure(value) };
  return JSON.stringify(envelope);
}

function decodeBridgeValue(raw: unknown): Uint8Array | string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Uint8Array) return new Uint8Array(raw);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Partial<SerializedBridgeValue>;
      if (parsed && parsed.encoding === 'utf8' && typeof parsed.payload === 'string') {
        return parsed.payload;
      }
      if (parsed && parsed.encoding === 'base64' && typeof parsed.payload === 'string') {
        return base64ToBytesPure(parsed.payload);
      }
    } catch {
      return raw;
    }
    return raw;
  }
  return String(raw);
}

export class NativeBridgeStorageAdapter implements IStorageAdapter {
  public readonly name: string;
  public readonly capabilities: StorageCapabilities = {
    driver: 'native-bridge',
    isPersistent: true,
    supportsBinary: true,
    supportsTransactions: false,
    supportsQuerying: false,
    supportsStreaming: false,
  };

  private readonly bridge: IPlatformBridge;
  private readonly namespace: string;

  constructor(bridge: IPlatformBridge, namespace = 'app_storage') {
    this.bridge = bridge;
    this.namespace = namespace;
    this.name = `native-bridge(${bridge.shellType})`;
  }

  private scopedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private unscopeKey(fullKey: string): string {
    const prefix = `${this.namespace}:`;
    return fullKey.indexOf(prefix) === 0 ? fullKey.slice(prefix.length) : fullKey;
  }

  public async isSupported(): Promise<boolean> {
    if (typeof this.bridge.invokeStorageBridge !== 'function') {
      return false;
    }
    const caps = await this.bridge.detectCapabilities();
    return caps.hasNativeBridge;
  }

  public async initialize(): Promise<void> {
    if (typeof this.bridge.invokeStorageBridge !== 'function') {
      throw new Error('Native storage bridge is unavailable');
    }
    const caps = await this.bridge.detectCapabilities();
    if (!caps.hasNativeBridge) {
      throw new Error('Native storage bridge is not configured in this environment');
    }
  }

  public async getItem(key: string): Promise<Uint8Array | string | null> {
    if (!this.bridge.invokeStorageBridge) return null;
    const res = await this.bridge.invokeStorageBridge({
      action: 'read',
      key: this.scopedKey(key),
    });
    if (!res.ok) return null;
    return decodeBridgeValue(res.data);
  }

  public async setItem(key: string, value: Uint8Array | string): Promise<void> {
    if (!this.bridge.invokeStorageBridge) {
      throw new Error('Native storage bridge is unavailable');
    }
    const res = await this.bridge.invokeStorageBridge({
      action: 'write',
      key: this.scopedKey(key),
      data: encodeBridgeValue(value),
    });
    if (!res.ok) {
      throw new Error(res.error || 'Native storage bridge write failed');
    }
  }

  public async removeItem(key: string): Promise<void> {
    if (!this.bridge.invokeStorageBridge) return;
    const res = await this.bridge.invokeStorageBridge({
      action: 'delete',
      key: this.scopedKey(key),
    });
    if (!res.ok) {
      throw new Error(res.error || 'Native storage bridge delete failed');
    }
  }

  public async clear(): Promise<void> {
    const allKeys = await this.keys();
    for (const key of allKeys) {
      await this.removeItem(key);
    }
  }

  public async keys(filter?: StorageFilterOptions): Promise<string[]> {
    if (!this.bridge.invokeStorageBridge) return [];
    const res = await this.bridge.invokeStorageBridge({
      action: 'list',
      options: { prefix: `${this.namespace}:${filter?.prefix || ''}` },
    });
    if (!res.ok || !Array.isArray(res.data)) {
      return [];
    }
    let out = res.data.map((item) => this.unscopeKey(String(item)));
    if (filter?.prefix) {
      const prefix = filter.prefix;
      out = out.filter((k) => k.indexOf(prefix) === 0);
    }
    out.sort();
    if (filter?.reverse) out.reverse();
    const offset = filter?.offset && filter.offset > 0 ? filter.offset : 0;
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : undefined;
    return limit !== undefined ? out.slice(offset, offset + limit) : out.slice(offset);
  }

  public async hasItem(key: string): Promise<boolean> {
    return (await this.getItem(key)) !== null;
  }

  public async getQuotaInfo(): Promise<StorageQuotaInfo> {
    const allKeys = await this.keys();
    let bytesUsed = 0;
    for (const key of allKeys) {
      const val = await this.getItem(key);
      if (typeof val === 'string') {
        bytesUsed += utf8StringToBytes(val).byteLength;
      } else if (val instanceof Uint8Array) {
        bytesUsed += val.byteLength;
      }
    }
    return { bytesUsed };
  }
}
