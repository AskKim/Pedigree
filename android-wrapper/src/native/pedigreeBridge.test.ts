/**
 * Community Pedigree — Native Bridge Unit Tests
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Run with: `npm test`
 *
 * Verifies:
 * 1. Standard browser fallbacks (`window.print()`, Blob downloads + cleanup, `null` container info)
 * 2. Strict `https:` / `mailto:` protocol allowlisting in `openExternalUrl`
 * 3. Android `WebMessageListener` two-frame binary streaming (`BEGIN_BINARY_TRANSFER` + sliced `ArrayBuffer`)
 * 4. Priority + LIFO Back handler unwinding (`NATIVE_BACK` -> `NATIVE_BACK_RESULT`)
 * 5. Origin-spoof rejection & 400ms `GET_CONTAINER_INFO` timeout behavior
 * 6. iOS `WKScriptMessageHandler` base64 envelope serialization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ANDROID_ASSET_ORIGIN, createPedigreeBridge, PedigreeBridge } from './pedigreeBridge';

interface MockAnchor {
  href: string;
  target: string;
  rel: string;
  download: string;
  style: { display: string };
  click: ReturnType<typeof vi.fn>;
}

function setupMockDom(origin = 'https://appassets.androidplatform.net') {
  const createdAnchors: MockAnchor[] = [];
  const win: Record<string, unknown> = {
    location: {
      origin: origin,
      href: origin + '/',
    },
    print: vi.fn(),
  };

  const doc = {
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    createElement: vi.fn((tag: string) => {
      const anchor: MockAnchor = {
        href: '',
        target: '',
        rel: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };
      if (tag === 'a') {
        createdAnchors.push(anchor);
      }
      return anchor;
    }),
  };

  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);

  return { win, doc, createdAnchors };
}

describe('PedigreeBridge', () => {
  let bridge: PedigreeBridge;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (bridge) {
      bridge.destroy();
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('platform detection and browser fallbacks', () => {
    it('detects standard web browser when no native handler exists', () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.getPlatform()).toBe('web');
      expect(bridge.isNativeWrapper()).toBe(false);
      expect(bridge.openNativeDevPanel()).toBe(false);
    });

    it('resolves getNativeContainerInfo immediately to null in standard browser', async () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      const info = await bridge.getNativeContainerInfo(400);
      expect(info).toBeNull();
    });

    it('falls back to window.print() in standard browser', () => {
      const { win } = setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.requestPrint()).toBe(true);
      expect(win.print).toHaveBeenCalledTimes(1);
    });

    it('falls back to Blob download for binary exports in standard browser', async () => {
      const { createdAnchors } = setupMockDom('https://askkim.github.io');
      const createObjectURL = vi.fn(() => 'blob:mock-backup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      });
      vi.stubGlobal('navigator', {});

      bridge = createPedigreeBridge();
      const payload = new Uint8Array([1, 2, 3, 4]);
      const result = await bridge.exportOrShareBinary({
        filename: 'barn-backup.zip',
        mimeType: 'application/zip',
        mode: 'save',
        bytes: payload,
      });

      expect(result).toEqual({ ok: true, handledBy: 'web-download' });
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createdAnchors[0].download).toBe('barn-backup.zip');
      expect(createdAnchors[0].click).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10000);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-backup');
    });

    it('revokes pending blob URLs and clears listeners on destroy()', async () => {
      setupMockDom('https://askkim.github.io');
      const createObjectURL = vi.fn(() => 'blob:pending-cleanup');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      });
      vi.stubGlobal('navigator', {});

      bridge = createPedigreeBridge();
      await bridge.exportOrShareBinary({
        filename: 'pending.zip',
        mimeType: 'application/zip',
        mode: 'save',
        bytes: new Uint8Array([1, 2]),
      });

      bridge.destroy();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:pending-cleanup');
    });

    it('returns false for syncBackupSnapshotToNative in standard browser', async () => {
      setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      const ok = await bridge.syncBackupSnapshotToNative({
        snapshotId: 'web_noop',
        createdAt: '2026-11-19T15:00:00.000Z',
        format: 'json',
        bytes: new Uint8Array([123, 125]),
      });
      expect(ok).toBe(false);
    });
  });

  describe('openExternalUrl security validation', () => {
    it('permits https: and mailto: URLs and rejects unsafe schemes', () => {
      const { win, createdAnchors } = setupMockDom('https://askkim.github.io');
      bridge = createPedigreeBridge();

      expect(bridge.openExternalUrl('https://github.com/AskKim/Pedigree', 'repo')).toBe(true);
      expect(createdAnchors[0].href).toBe('https://github.com/AskKim/Pedigree');
      expect(createdAnchors[0].rel).toBe('noopener noreferrer');

      expect(bridge.openExternalUrl('mailto:support@example.org?subject=Diagnostics', 'support')).toBe(true);
      expect((win.location as { href: string }).href).toBe('mailto:support@example.org?subject=Diagnostics');

      expect(bridge.openExternalUrl('http://insecure.example.com')).toBe(false);
      expect(bridge.openExternalUrl('file:///etc/passwd')).toBe(false);
      expect(bridge.openExternalUrl('javascript:alert(1)')).toBe(false);
      expect(bridge.openExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(bridge.openExternalUrl('not a valid url')).toBe(false);
      expect(bridge.getDiagnosticEvents().length).toBe(5);
    });
  });

  describe('Android WebMessageListener serialization and replies', () => {
    function setupAndroidMock(origin = ANDROID_ASSET_ORIGIN) {
      const { win } = setupMockDom(origin);
      const posted: Array<string | ArrayBuffer> = [];
      let listener: ((event: { data: unknown; origin?: string }) => void) | null = null;

      const pedigreeNative = {
        postMessage: vi.fn((msg: string | ArrayBuffer) => {
          posted.push(msg);
        }),
        addEventListener: vi.fn((type: string, cb: (event: { data: unknown; origin?: string }) => void) => {
          if (type === 'message') {
            listener = cb;
          }
        }),
        removeEventListener: vi.fn(),
      };

      win.pedigreeNative = pedigreeNative;
      return {
        win,
        pedigreeNative,
        posted,
        emitNativeMessage: (data: unknown, msgOrigin = origin) => {
          if (listener) {
            listener({ data, origin: msgOrigin });
          }
        },
      };
    }

    it('streams BEGIN_BINARY_TRANSFER JSON metadata followed by sliced ArrayBuffer', async () => {
      const { posted } = setupAndroidMock();
      bridge = createPedigreeBridge();

      expect(bridge.getPlatform()).toBe('android');
      expect(bridge.isNativeWrapper()).toBe(true);

      const backing = new Uint8Array([9, 10, 11, 12, 13, 14]);
      const view = backing.subarray(1, 5); // [10, 11, 12, 13]

      const result = await bridge.exportOrShareBinary({
        filename: 'pedigree.pdf',
        mimeType: 'application/pdf',
        mode: 'share',
        bytes: view,
      });

      expect(result).toEqual({ ok: true, handledBy: 'android' });
      expect(posted).toHaveLength(2);

      const meta = JSON.parse(posted[0] as string);
      expect(meta.type).toBe('BEGIN_BINARY_TRANSFER');
      expect(meta.payload).toEqual({
        filename: 'pedigree.pdf',
        mimeType: 'application/pdf',
        mode: 'share',
        byteLength: 4,
      });

      expect(posted[1]).toBeInstanceOf(ArrayBuffer);
      expect(Array.from(new Uint8Array(posted[1] as ArrayBuffer))).toEqual([10, 11, 12, 13]);
    });

    it('executes back handlers by priority and LIFO, returning handled: false at root', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const callOrder: string[] = [];
      const unregisterRoute = bridge.registerBackHandler(() => {
        callOrder.push('route');
        return true;
      }, 0);

      const unregisterModal = bridge.registerBackHandler(() => {
        callOrder.push('modal');
        return true;
      }, 10);

      emitNativeMessage(JSON.stringify({ type: 'NATIVE_BACK', requestId: 'req_1' }));
      await Promise.resolve();
      await Promise.resolve();

      expect(callOrder).toEqual(['modal']);
      expect(JSON.parse(posted[0] as string)).toEqual({
        type: 'NATIVE_BACK_RESULT',
        requestId: 'req_1',
        payload: { handled: true },
      });

      unregisterModal();
      unregisterRoute();

      emitNativeMessage(JSON.stringify({ type: 'NATIVE_BACK', requestId: 'req_2' }));
      await Promise.resolve();
      await Promise.resolve();

      expect(JSON.parse(posted[1] as string)).toEqual({
        type: 'NATIVE_BACK_RESULT',
        requestId: 'req_2',
        payload: { handled: false },
      });
    });

    it('correlates GET_CONTAINER_INFO replies and resolves null on 400ms timeout', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const infoPromise = bridge.getNativeContainerInfo(400);
      const sent = JSON.parse(posted[0] as string);
      expect(sent.type).toBe('GET_CONTAINER_INFO');

      emitNativeMessage(
        JSON.stringify({
          type: 'CONTAINER_INFO_RESULT',
          requestId: sent.requestId,
          payload: {
            platform: 'android',
            webViewVersion: '108.0.5359.128',
            webViewMajorVersion: 108,
            opfsSupportedInWebView: false,
            vaultSnapshotCount: 3,
          },
        })
      );

      const info = await infoPromise;
      expect(info).toEqual({
        platform: 'android',
        webViewVersion: '108.0.5359.128',
        webViewMajorVersion: 108,
        opfsSupportedInWebView: false,
        vaultSnapshotCount: 3,
      });

      const timedOutPromise = bridge.getNativeContainerInfo(400);
      vi.advanceTimersByTime(400);
      const timedOut = await timedOutPromise;
      expect(timedOut).toBeNull();
    });

    it('ignores native messages from untrusted origins', async () => {
      const { posted, emitNativeMessage } = setupAndroidMock();
      bridge = createPedigreeBridge();

      emitNativeMessage(
        JSON.stringify({ type: 'NATIVE_BACK', requestId: 'bad_req' }),
        'https://evil.example.com'
      );
      await Promise.resolve();

      expect(posted).toHaveLength(0);
      expect(bridge.getDiagnosticEvents()[0].code).toBe('REJECTED_UNTRUSTED_ORIGIN');
    });

    it('mirrors backup snapshots via SYNC_BACKUP_SNAPSHOT + ArrayBuffer', async () => {
      const { posted } = setupAndroidMock();
      bridge = createPedigreeBridge();

      const ok = await bridge.syncBackupSnapshotToNative({
        snapshotId: 'snap_01',
        createdAt: '2026-11-19T14:16:00.000Z',
        format: 'zip',
        bytes: new Uint8Array([80, 75, 3, 4]),
        metadata: { herdCount: 12 },
      });

      expect(ok).toBe(true);
      expect(posted).toHaveLength(2);
      const meta = JSON.parse(posted[0] as string);
      expect(meta.type).toBe('SYNC_BACKUP_SNAPSHOT');
      expect(meta.payload.snapshotId).toBe('snap_01');
      expect(meta.payload.byteLength).toBe(4);
      expect(Array.from(new Uint8Array(posted[1] as ArrayBuffer))).toEqual([80, 75, 3, 4]);
    });
  });

  describe('iOS WKScriptMessageHandler serialization', () => {
    it('serializes binary export as base64 payload for webkit messageHandlers', async () => {
      const { win } = setupMockDom('capacitor://localhost');
      const iosPosted: unknown[] = [];
      win.webkit = {
        messageHandlers: {
          pedigreeNative: {
            postMessage: vi.fn((msg: unknown) => {
              iosPosted.push(msg);
            }),
          },
        },
      };

      bridge = createPedigreeBridge();
      expect(bridge.getPlatform()).toBe('ios');
      expect(bridge.isNativeWrapper()).toBe(true);

      const bytes = new Uint8Array([72, 105]); // "Hi"
      const result = await bridge.exportOrShareBinary({
        filename: 'note.txt',
        mimeType: 'text/plain',
        mode: 'save',
        bytes: bytes,
      });

      expect(result).toEqual({ ok: true, handledBy: 'ios' });
      expect(iosPosted).toHaveLength(1);
      const envelope = iosPosted[0] as { type: string; payload: Record<string, unknown> };
      expect(envelope.type).toBe('EXPORT_OR_SHARE_BINARY');
      expect(envelope.payload.base64Data).toBe('SGk=');
      expect(envelope.payload.byteLength).toBe(2);
    });
  });
});
