import { describe, expect, it } from 'vitest';
import {
  buildLowMemorySettingsPatch,
  classifyDeviceCapability,
  DEVICE_CAPABILITY_TIER_LIST,
  DEVICE_CAPABILITY_TIERS,
  DeviceHardwareSignals,
  evaluateBarnWorkloadForTier,
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

  it('classifies mobile RAM profiles cleanly into Tiers 1 through 4 and desktops/tablets into Tier 5', () => {
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

    const tier3 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 512 * MB,
      })
    );
    expect(tier3.tier).toBe(3);
    expect(tier3.shouldApplyLowMemoryHandling).toBe(false);

    const tier4 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 1024 * MB,
      })
    );
    expect(tier4.tier).toBe(4);
    expect(tier4.formFactor).toBe('phone');

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

    const tier5Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 8,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 820,
        screenHeightPx: 1180,
      })
    );
    expect(tier5Tablet.tier).toBe(5);
    expect(tier5Tablet.formFactor).toBe('tablet');
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
});
