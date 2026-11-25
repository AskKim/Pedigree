import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopBridgeDelegates,
  createPlatformBridge,
} from '@engine/bridge';
import {
  assessBrowserCompatibility,
  BrowserFeatureSignals,
  buildLowMemorySettingsPatch,
  classifyDeviceCapability,
  DEVICE_CAPABILITY_TIER_LIST,
  DEVICE_CAPABILITY_TIERS,
  DeviceHardwareSignals,
  evaluateBarnWorkloadForTier,
  getHeavyZipExportGate,
  getTierStoragePolicy,
  TIER_STORAGE_POLICIES,
} from '../deviceCapability';

const MB = 1024 * 1024;

function makeSignals(overrides: Partial<DeviceHardwareSignals> = {}): DeviceHardwareSignals {
  return {
    deviceMemoryGb: null,
    hardwareConcurrency: 4,
    jsHeapLimitBytes: null,
    usedHeapBytes: null,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A155U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    coarsePointer: true,
    screenWidthPx: 412,
    screenHeightPx: 915,
    devicePixelRatio: 2.6,
    ...overrides,
  };
}

function makeBrowserSignals(
  overrides: Partial<BrowserFeatureSignals> = {}
): BrowserFeatureSignals {
  return {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    promiseSupported: true,
    indexedDbSupported: true,
    wasmSupported: true,
    moduleWorkerSupported: true,
    opfsSupported: true,
    directoryPickerSupported: true,
    persistStorageSupported: true,
    clipboardWriteSupported: true,
    webShareFilesSupported: false,
    webpEncodeSupported: true,
    createImageBitmapSupported: true,
    workerRuntimeDisabled: false,
    ...overrides,
  };
}

describe('deviceCapability — 5-tier classification, closability rules & low-memory handling', () => {
  it('enforces exact Home & Settings closability/reopenability rules across all 5 tiers', () => {
    expect(DEVICE_CAPABILITY_TIERS[1].homeClosable).toBe(false);
    expect(DEVICE_CAPABILITY_TIERS[1].settingsClosable).toBe(false);

    expect(DEVICE_CAPABILITY_TIERS[2].homeClosable).toBe(true);
    expect(DEVICE_CAPABILITY_TIERS[2].settingsClosable).toBe(false);

    for (const tier of [3, 4, 5] as const) {
      expect(DEVICE_CAPABILITY_TIERS[tier].homeClosable).toBe(true);
      expect(DEVICE_CAPABILITY_TIERS[tier].settingsClosable).toBe(true);
      expect(DEVICE_CAPABILITY_TIERS[tier].canReopenInSettings).toBe(true);
    }

    expect(DEVICE_CAPABILITY_TIER_LIST).toHaveLength(5);
  });

  it('classifies mobile and tablet RAM profiles across Tiers 1 through 4 and desktops into Tier 5', () => {
    const tier1 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 1,
        hardwareConcurrency: 2,
        jsHeapLimitBytes: 96 * MB,
        userAgent: 'Mozilla/5.0 (Linux; Android 5.1.1; SM-G530T) Mobile Safari/537.36',
      })
    );
    expect(tier1.tier).toBe(1);
    expect(tier1.shouldApplyLowMemoryHandling).toBe(true);

    const tier2 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 2,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: 220 * MB,
        userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G950U) Mobile Safari/537.36',
      })
    );
    expect(tier2.tier).toBe(2);
    expect(tier2.shouldApplyLowMemoryHandling).toBe(true);

    const tier2Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 3,
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-T220) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        screenWidthPx: 800,
        screenHeightPx: 1340,
      })
    );
    expect(tier2Tablet.tier).toBe(2);
    expect(tier2Tablet.formFactor).toBe('tablet');

    const tier3 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 512 * MB,
      })
    );
    expect(tier3.tier).toBe(3);
    expect(tier3.shouldApplyLowMemoryHandling).toBe(false);

    const tier3Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        screenWidthPx: 800,
        screenHeightPx: 1280,
      })
    );
    expect(tier3Tablet.tier).toBe(3);
    expect(tier3Tablet.formFactor).toBe('tablet');

    const tier4 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 1024 * MB,
      })
    );
    expect(tier4.tier).toBe(4);
    expect(tier4.formFactor).toBe('phone');

    const tier4Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 8,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 820,
        screenHeightPx: 1180,
      })
    );
    expect(tier4Tablet.tier).toBe(4);
    expect(tier4Tablet.formFactor).toBe('tablet');

    const tier5Desktop = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 8,
        hardwareConcurrency: 12,
        jsHeapLimitBytes: 2048 * MB,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
        coarsePointer: false,
        screenWidthPx: 1920,
        screenHeightPx: 1080,
      })
    );
    expect(tier5Desktop.tier).toBe(5);
    expect(tier5Desktop.formFactor).toBe('desktop');
  });

  it('classifies browsers without navigator.deviceMemory (such as iOS Safari) cleanly', () => {
    const legacyIphone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 2,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 375,
        screenHeightPx: 667,
        devicePixelRatio: 2,
      })
    );
    expect(legacyIphone.tier).toBe(2);
    expect(legacyIphone.confidence).toBe('estimated');

    const modernIphone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 6,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 393,
        screenHeightPx: 852,
        devicePixelRatio: 3,
      })
    );
    expect(modernIphone.tier).toBe(4);
  });

  it('down-tiers mobile devices when V8 JS heap limit is tightly constrained even if deviceMemory reads higher', () => {
    const tightHeapPhone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: 240 * MB,
      })
    );
    expect(tightHeapPhone.tier).toBe(2);
  });

  it('evaluates barn workload against device tier ceiling and suggests low-memory patches only for Tiers 1-2', () => {
    const tier2 = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 2 }));
    const okLoad = evaluateBarnWorkloadForTier(1200, tier2);
    expect(okLoad.status).toBe('ok');
    expect(okLoad.guidance).toBeNull();

    const nearLoad = evaluateBarnWorkloadForTier(2500, tier2);
    expect(nearLoad.status).toBe('approaching_limit');
    expect(nearLoad.guidance).toContain('2,500');

    const overLoad = evaluateBarnWorkloadForTier(3400, tier2);
    expect(overLoad.status).toBe('over_limit');
    expect(overLoad.guidance).toContain('3,000');

    const heavySettingsPatch = buildLowMemorySettingsPatch(
      {
        imageOptimizationPreset: 'high_detail',
        defaultGenerations: 5,
        includePhotoOnPedigree: true,
      },
      tier2
    );
    expect(heavySettingsPatch).toEqual({
      imageOptimizationPreset: 'compact',
      defaultGenerations: 3,
      includePhotoOnPedigree: false,
    });

    const alreadySafePatch = buildLowMemorySettingsPatch(
      {
        imageOptimizationPreset: 'compact',
        defaultGenerations: 3,
        includePhotoOnPedigree: false,
      },
      tier2
    );
    expect(alreadySafePatch).toBeNull();

    const tier4 = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 8, hardwareConcurrency: 8 }));
    expect(
      buildLowMemorySettingsPatch(
        {
          imageOptimizationPreset: 'high_detail',
          defaultGenerations: 5,
          includePhotoOnPedigree: true,
        },
        tier4
      )
    ).toBeNull();
  });

  it('enforces tightened local storage caps & thumbnail-light mirror dehydration on Tiers 1 and 2', () => {
    const t1 = getTierStoragePolicy(1);
    const t2 = getTierStoragePolicy(2);
    const t3 = getTierStoragePolicy(3);
    const t5 = getTierStoragePolicy(5);

    expect(t1.monthlyCap).toBe(2);
    expect(t1.preUpgradeCap).toBe(1);
    expect(t1.manualCap).toBe(3);
    expect(t1.rollingIdbCap).toBe(1);
    expect(t1.dehydrateMirrorPhotos).toBe(true);
    expect(t1.skipHeavyCanaryZip).toBe(true);
    expect(t1.compressVaultBackups).toBe(true);

    expect(t2.monthlyCap).toBe(3);
    expect(t2.manualCap).toBe(5);
    expect(t2.rollingIdbCap).toBe(2);
    expect(t2.dehydrateMirrorPhotos).toBe(true);
    expect(t2.maxSafeImportBytesHint).toBeGreaterThan(t1.maxSafeImportBytesHint);

    expect(t3.dehydrateMirrorPhotos).toBe(true);
    expect(t5.dehydrateMirrorPhotos).toBe(false);
    expect(t5.monthlyCap).toBe(6);
    expect(t5.preUpgradeCap).toBe(3);
    expect(t5.preResetCap).toBe(8);
    expect(t5.manualCap).toBe(12);
    expect(Object.keys(TIER_STORAGE_POLICIES)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('assesses browser compatibility gaps, WASM fallback state, and Tier 1 / outdated .ZIP confirmation gates', () => {
    const modernDesktop = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 16,
        hardwareConcurrency: 12,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
        coarsePointer: false,
      })
    );
    const modernBrowser = assessBrowserCompatibility(makeBrowserSignals(), modernDesktop.tier);
    expect(modernBrowser.isOutdatedBrowser).toBe(false);
    expect(modernBrowser.wasmFallbackActive).toBe(false);
    expect(modernBrowser.shouldConfirmHeavyZipExport).toBe(false);
    expect(getHeavyZipExportGate(modernDesktop, modernBrowser).requiresConfirmation).toBe(false);

    const tier1Device = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 1, hardwareConcurrency: 2 }));
    const tier1Gate = getHeavyZipExportGate(tier1Device, assessBrowserCompatibility(makeBrowserSignals(), tier1Device.tier));
    expect(tier1Gate.requiresConfirmation).toBe(true);
    expect(tier1Gate.advice).toContain('.JSON');

    const olderSafari = assessBrowserCompatibility(
      makeBrowserSignals({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        wasmSupported: false,
        opfsSupported: false,
        directoryPickerSupported: false,
        persistStorageSupported: false,
        webpEncodeSupported: false,
      }),
      3
    );
    expect(olderSafari.isOutdatedBrowser).toBe(true);
    expect(olderSafari.wasmFallbackActive).toBe(true);
    expect(olderSafari.shouldConfirmHeavyZipExport).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'wasm')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'opfs')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'directoryPicker')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'persistStorage')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'webp')).toBe(true);
  });
});

describe('PlatformBridge desktop adapter routing (Electron / Tauri / standard browser)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('routes binary export, print, external URL, and native storage via window.electronAPI', async () => {
    const exportBinaryMock = vi.fn(async () => true);
    const printMock = vi.fn(async () => true);
    const storageMock = vi.fn(async () => ({ ok: true, data: 'electron-val' }));
    const openExternalMock = vi.fn(async () => true);

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Electron/31.0.0' });
    vi.stubGlobal('document', {});
    vi.stubGlobal('electronAPI', {
      exportBinary: exportBinaryMock,
      printDocument: printMock,
      invokeStorageBridge: storageMock,
      openExternal: openExternalMock,
    });

    const bridge = createPlatformBridge();
    const caps = await bridge.detectCapabilities();
    expect(caps.shell).toBe('desktop-electron');
    expect(caps.hasNativeBridge).toBe(true);
    expect(caps.hasHardwareBackNavigation).toBe(true);

    const exportRes = await bridge.exportBinary({
      filename: 'snapshot.bin',
      mimeType: 'application/octet-stream',
      mode: 'save',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(exportRes).toEqual({ ok: true, handledBy: 'native-desktop' });
    expect(exportBinaryMock).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'snapshot.bin', byteLength: 3, base64Data: 'AQID' })
    );

    expect(
      await bridge.printDocument({
        title: 'Report',
        orientation: 'portrait',
        htmlContent: '<html><body>Report</body></html>',
      })
    ).toBe(true);
    expect(printMock).toHaveBeenCalledTimes(1);

    expect(await bridge.openExternalUrl('https://example.org/docs')).toBe(true);
    expect(openExternalMock).toHaveBeenCalledWith('https://example.org/docs');

    const storageRes = await bridge.invokeStorageBridge({ action: 'read', key: 'k1' });
    expect(storageRes).toEqual({ ok: true, data: 'electron-val' });
    bridge.destroy();
  });

  it('routes binary export, print, external URL, and native storage via window.__TAURI_INTERNALS__', async () => {
    const invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === 'bridge_storage_op') {
        return { ok: true, data: ['k1', 'k2'] };
      }
      return true;
    });

    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Tauri/2.0' });
    vi.stubGlobal('document', {});
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: invokeMock });

    const bridge = createPlatformBridge();
    const caps = await bridge.detectCapabilities();
    expect(caps.shell).toBe('desktop-tauri');
    expect(caps.hasNativeBridge).toBe(true);

    const exportRes = await bridge.exportBinary({
      filename: 'bundle.json',
      mimeType: 'application/json',
      mode: 'save',
      bytes: new Uint8Array([123, 125]),
    });
    expect(exportRes).toEqual({ ok: true, handledBy: 'native-desktop' });
    expect(invokeMock).toHaveBeenCalledWith(
      'bridge_export_binary',
      expect.objectContaining({ filename: 'bundle.json', byteLength: 2, base64Data: 'e30=' })
    );

    expect(
      await bridge.printDocument({
        title: 'Summary',
        orientation: 'landscape',
        htmlContent: '<html><body>Summary</body></html>',
      })
    ).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'bridge_print_document',
      expect.objectContaining({ title: 'Summary', orientation: 'landscape' })
    );

    const storageRes = await bridge.invokeStorageBridge({ action: 'list' });
    expect(storageRes).toEqual({ ok: true, data: ['k1', 'k2'] });
    expect(await bridge.openExternalUrl('javascript:alert(1)')).toBe(false);
    bridge.destroy();
  });

  it('returns null desktop delegates and safe web-browser detection when no desktop global exists', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/126.0.0.0 Safari/537.36' });
    vi.stubGlobal('document', {});

    expect(createDesktopBridgeDelegates(undefined)).toBeNull();
    const bridge = createPlatformBridge();
    const caps = await bridge.detectCapabilities();
    expect(caps.shell).toBe('web-browser');
    expect(caps.hasNativeBridge).toBe(false);
    bridge.destroy();
  });
});
