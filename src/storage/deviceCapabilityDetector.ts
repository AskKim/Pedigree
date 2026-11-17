/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Hardware & Feature Signal Collector, Per-Device Dismissal State & React Hook
 * (`src/storage/deviceCapabilityDetector.ts`).
 *
 * Dismissal state is stored strictly in per-device `localStorage` (not inside the
 * portable BarnSettings JSON/SQLite snapshot) so restoring a desktop Tier 5 backup onto
 * a low-memory mobile device never suppresses critical Tier 1 / Tier 2 warnings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assessBrowserCompatibility,
  BrowserCompatibilityAssessment,
  BrowserFeatureSignals,
  classifyDeviceCapability,
  DeviceCapabilityAssessment,
  DeviceHardwareSignals,
} from '../core/deviceCapability';
import { logDiagnosticEvent } from './crashLogger';
import { isArchiveWorkerDisabled } from './offThreadWorkerClient';

const HOME_DISMISSED_KEY = 'pedigree.deviceCapability.homeDismissed.v1';
const SETTINGS_DISMISSED_KEY = 'pedigree.deviceCapability.settingsDismissed.v1';

interface PerformanceWithMemory extends Performance {
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

let cachedWebpEncodeSupported: boolean | null = null;

export function probeWebpEncodeSupport(): boolean {
  if (cachedWebpEncodeSupported !== null) return cachedWebpEncodeSupported;
  if (typeof document === 'undefined') {
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    if (typeof canvas.toDataURL !== 'function') {
      cachedWebpEncodeSupported = false;
      return false;
    }
    const url = canvas.toDataURL('image/webp');
    cachedWebpEncodeSupported = typeof url === 'string' && url.indexOf('data:image/webp') === 0;
  } catch {
    cachedWebpEncodeSupported = false;
  }
  return cachedWebpEncodeSupported;
}

export function readBrowserHardwareSignals(): DeviceHardwareSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      jsHeapLimitBytes: null,
      usedHeapBytes: null,
      userAgent: '',
      maxTouchPoints: 0,
      coarsePointer: false,
      screenWidthPx: null,
      screenHeightPx: null,
      devicePixelRatio: null,
    };
  }

  const nav = navigator as NavigatorWithDeviceMemory;
  const deviceMemoryGb =
    typeof nav.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory) && nav.deviceMemory > 0
      ? nav.deviceMemory
      : null;

  const hardwareConcurrency =
    typeof navigator.hardwareConcurrency === 'number' &&
    Number.isFinite(navigator.hardwareConcurrency) &&
    navigator.hardwareConcurrency > 0
      ? navigator.hardwareConcurrency
      : null;

  let jsHeapLimitBytes: number | null = null;
  let usedHeapBytes: number | null = null;
  try {
    const perf = typeof performance !== 'undefined' ? (performance as PerformanceWithMemory) : null;
    if (perf?.memory) {
      if (
        typeof perf.memory.jsHeapSizeLimit === 'number' &&
        Number.isFinite(perf.memory.jsHeapSizeLimit)
      ) {
        jsHeapLimitBytes = perf.memory.jsHeapSizeLimit;
      }
      if (
        typeof perf.memory.usedJSHeapSize === 'number' &&
        Number.isFinite(perf.memory.usedJSHeapSize)
      ) {
        usedHeapBytes = perf.memory.usedJSHeapSize;
      }
    }
  } catch {
    // Ignore restricted performance.memory access
  }

  let coarsePointer = false;
  try {
    if (typeof window.matchMedia === 'function') {
      coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    }
  } catch {
    coarsePointer = false;
  }

  let screenWidthPx: number | null = null;
  let screenHeightPx: number | null = null;
  try {
    if (typeof window.screen !== 'undefined') {
      if (typeof window.screen.width === 'number' && Number.isFinite(window.screen.width)) {
        screenWidthPx = window.screen.width;
      }
      if (typeof window.screen.height === 'number' && Number.isFinite(window.screen.height)) {
        screenHeightPx = window.screen.height;
      }
    }
  } catch {
    // Ignore restricted screen access
  }

  const devicePixelRatio =
    typeof window.devicePixelRatio === 'number' && Number.isFinite(window.devicePixelRatio)
      ? window.devicePixelRatio
      : null;

  return {
    deviceMemoryGb,
    hardwareConcurrency,
    jsHeapLimitBytes,
    usedHeapBytes,
    userAgent: navigator.userAgent || '',
    maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
    coarsePointer,
    screenWidthPx,
    screenHeightPx,
    devicePixelRatio,
  };
}

export function readBrowserFeatureSignals(): BrowserFeatureSignals {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent: '',
      promiseSupported: true,
      indexedDbSupported: true,
      wasmSupported: true,
      moduleWorkerSupported: true,
      opfsSupported: true,
      directoryPickerSupported: true,
      persistStorageSupported: true,
      clipboardWriteSupported: true,
      webShareFilesSupported: true,
      webpEncodeSupported: true,
      createImageBitmapSupported: true,
      workerRuntimeDisabled: false,
    };
  }

  let indexedDbSupported = false;
  try {
    indexedDbSupported = 'indexedDB' in window && Boolean(window.indexedDB);
  } catch {
    indexedDbSupported = false;
  }

  let wasmSupported = false;
  try {
    wasmSupported =
      typeof WebAssembly === 'object' &&
      WebAssembly !== null &&
      typeof WebAssembly.instantiate === 'function';
  } catch {
    wasmSupported = false;
  }

  const storageObj = (navigator as Navigator & { storage?: StorageManager }).storage;

  const opfsSupported =
    typeof storageObj !== 'undefined' &&
    storageObj !== null &&
    typeof storageObj.getDirectory === 'function';

  const persistStorageSupported =
    typeof storageObj !== 'undefined' &&
    storageObj !== null &&
    typeof storageObj.persist === 'function';

  let directoryPickerSupported = false;
  try {
    directoryPickerSupported =
      'showDirectoryPicker' in window &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
        'function';
  } catch {
    directoryPickerSupported = false;
  }

  const clipboardWriteSupported =
    typeof navigator.clipboard !== 'undefined' &&
    navigator.clipboard !== null &&
    typeof navigator.clipboard.writeText === 'function';

  const webShareFilesSupported =
    typeof navigator.share === 'function' && typeof navigator.canShare === 'function';

  const workerDisabled = isArchiveWorkerDisabled();

  return {
    userAgent: navigator.userAgent || '',
    promiseSupported: typeof Promise === 'function',
    indexedDbSupported,
    wasmSupported,
    moduleWorkerSupported: typeof Worker === 'function',
    opfsSupported,
    directoryPickerSupported,
    persistStorageSupported,
    clipboardWriteSupported,
    webShareFilesSupported,
    webpEncodeSupported: probeWebpEncodeSupport(),
    createImageBitmapSupported: typeof createImageBitmap === 'function',
    workerRuntimeDisabled: workerDisabled,
  };
}

export function detectCurrentDeviceCapability(): DeviceCapabilityAssessment {
  return classifyDeviceCapability(readBrowserHardwareSignals());
}

export function detectCurrentBrowserCompatibility(
  assessment?: DeviceCapabilityAssessment
): BrowserCompatibilityAssessment {
  const resolved = assessment ?? detectCurrentDeviceCapability();
  return assessBrowserCompatibility(readBrowserFeatureSignals(), resolved.tier);
}

function readLocalFlag(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeLocalFlag(key: string, value: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore quota or private-browsing storage restrictions
  }
}

export interface DeviceCapabilityController {
  assessment: DeviceCapabilityAssessment;
  browserCompatibility: BrowserCompatibilityAssessment;
  homeDismissed: boolean;
  settingsDismissed: boolean;
  homeVisible: boolean;
  settingsVisible: boolean;
  canCloseOnHome: boolean;
  canCloseInSettings: boolean;
  dismissOnHome: () => void;
  reopenOnHome: () => void;
  dismissInSettings: () => void;
  reopenInSettings: () => void;
  refreshDetection: () => void;
}

export function useDeviceCapability(): DeviceCapabilityController {
  const [assessment, setAssessment] = useState<DeviceCapabilityAssessment>(() =>
    detectCurrentDeviceCapability()
  );
  const [browserCompatibility, setBrowserCompatibility] = useState<BrowserCompatibilityAssessment>(
    () => detectCurrentBrowserCompatibility(assessment)
  );
  const [homeDismissedRaw, setHomeDismissedRaw] = useState<boolean>(() =>
    readLocalFlag(HOME_DISMISSED_KEY)
  );
  const [settingsDismissedRaw, setSettingsDismissedRaw] = useState<boolean>(() =>
    readLocalFlag(SETTINGS_DISMISSED_KEY)
  );

  const loggedInitialRef = useRef(false);

  useEffect(() => {
    if (loggedInitialRef.current) return;
    loggedInitialRef.current = true;
    logDiagnosticEvent({
      level: assessment.tier === 1 || browserCompatibility.isOutdatedBrowser ? 'warn' : 'info',
      category: assessment.shouldApplyLowMemoryHandling ? 'memory' : 'lifecycle',
      message: `Device capability detected: ${assessment.definition.shortLabel} (${assessment.signalSummary})${
        browserCompatibility.wasmFallbackActive ? ' · WebAssembly unavailable (JSON fallback)' : ''
      }${browserCompatibility.isOutdatedBrowser ? ' · Older browser engine detected' : ''}`,
      details: {
        tier: assessment.tier,
        formFactor: assessment.formFactor,
        confidence: assessment.confidence,
        deviceMemoryGb: assessment.signals.deviceMemoryGb,
        hardwareConcurrency: assessment.signals.hardwareConcurrency,
        jsHeapLimitBytes: assessment.signals.jsHeapLimitBytes,
        wasmSupported: browserCompatibility.signals.wasmSupported,
        opfsSupported: browserCompatibility.signals.opfsSupported,
        directoryPickerSupported: browserCompatibility.signals.directoryPickerSupported,
        isOutdatedBrowser: browserCompatibility.isOutdatedBrowser,
      },
    });
  }, [assessment, browserCompatibility]);

  const canCloseOnHome = assessment.definition.homeClosable;
  const canCloseInSettings = assessment.definition.settingsClosable;

  // Enforce tier visibility rules strictly regardless of any previously saved flags:
  // - Tier 1: never closable on Home OR Settings
  // - Tier 2: closable on Home, persistent (never closable) in Settings
  // - Tier 3–5: closable on Home & Settings, and reopenable from Settings
  const homeDismissed = canCloseOnHome ? homeDismissedRaw : false;
  const settingsDismissed = canCloseInSettings ? settingsDismissedRaw : false;

  const dismissOnHome = useCallback(() => {
    if (!canCloseOnHome) return;
    writeLocalFlag(HOME_DISMISSED_KEY, true);
    setHomeDismissedRaw(true);
  }, [canCloseOnHome]);

  const reopenOnHome = useCallback(() => {
    writeLocalFlag(HOME_DISMISSED_KEY, false);
    setHomeDismissedRaw(false);
  }, []);

  const dismissInSettings = useCallback(() => {
    if (!canCloseInSettings) return;
    writeLocalFlag(SETTINGS_DISMISSED_KEY, true);
    setSettingsDismissedRaw(true);
  }, [canCloseInSettings]);

  const reopenInSettings = useCallback(() => {
    writeLocalFlag(SETTINGS_DISMISSED_KEY, false);
    setSettingsDismissedRaw(false);
  }, []);

  const refreshDetection = useCallback(() => {
    const nextAssessment = detectCurrentDeviceCapability();
    setAssessment(nextAssessment);
    setBrowserCompatibility(detectCurrentBrowserCompatibility(nextAssessment));
  }, []);

  return {
    assessment,
    browserCompatibility,
    homeDismissed,
    settingsDismissed,
    homeVisible: !homeDismissed,
    settingsVisible: !settingsDismissed,
    canCloseOnHome,
    canCloseInSettings,
    dismissOnHome,
    reopenOnHome,
    dismissInSettings,
    reopenInSettings,
    refreshDetection,
  };
}
