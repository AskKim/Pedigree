/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Device Capability Tiers, Hardware Detection & Memory Handling Engine
 * (`src/core/deviceCapability.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node dependencies.
 * Runs identically in Web PWA, Node.js tests, and React Native / Expo.
 *
 * Classifies the host device into 5 practical pedigree-workload tiers:
 * - Tier 1: Critical Memory Limit (Not Recommended) — locked visible on Home & Settings
 * - Tier 2: Compact / Low-Memory Baseline (Survival Mode) — closable on Home, persistent in Settings
 * - Tier 3: Mid-Tier Mobile Workhorse — closable on Home & Settings, reopenable from Settings
 * - Tier 4: Modern Mobile Standard — closable on Home & Settings, reopenable from Settings
 * - Tier 5: Desktop, Laptop & Tablet Class — closable on Home & Settings, reopenable from Settings
 */

import type { ImageOptimizationPresetId } from './imageOptimizationSpec';
import type { BarnSettings } from './models';

export type DeviceCapabilityTierNumber = 1 | 2 | 3 | 4 | 5;

export type DeviceTierSeverity = 'danger' | 'warn' | 'neutral' | 'good';

export type DeviceFormFactor = 'phone' | 'tablet' | 'desktop';

export interface DeviceHardwareSignals {
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  jsHeapLimitBytes: number | null;
  usedHeapBytes: number | null;
  userAgent: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  screenWidthPx: number | null;
  screenHeightPx: number | null;
  devicePixelRatio: number | null;
}

export interface DeviceTierDefinition {
  tier: DeviceCapabilityTierNumber;
  slug:
    | 'critical-low-memory'
    | 'survival-baseline'
    | 'standard-mobile'
    | 'modern-mobile'
    | 'desktop-powerhouse';
  shortLabel: string;
  title: string;
  badgeLabel: string;
  severity: DeviceTierSeverity;
  targetHardware: string;
  browserReality: string;
  workloadProfile: string;
  cautionNotice: string;
  maxRecommendedRecords: number | null;
  recommendedImagePreset: ImageOptimizationPresetId;
  recommendedDefaultGenerations: 3 | 4 | 5 | 6;
  homeClosable: boolean;
  settingsClosable: boolean;
  canReopenInSettings: boolean;
}

export interface DeviceCapabilityAssessment {
  tier: DeviceCapabilityTierNumber;
  definition: DeviceTierDefinition;
  formFactor: DeviceFormFactor;
  confidence: 'measured' | 'estimated';
  signalSummary: string;
  signals: DeviceHardwareSignals;
  shouldApplyLowMemoryHandling: boolean;
}

export interface BarnWorkloadEvaluation {
  totalRecords: number;
  maxRecommendedRecords: number | null;
  utilizationPercent: number | null;
  status: 'ok' | 'approaching_limit' | 'over_limit';
  guidance: string | null;
}

export const DEVICE_CAPABILITY_TIERS: Record<DeviceCapabilityTierNumber, DeviceTierDefinition> = {
  1: {
    tier: 1,
    slug: 'critical-low-memory',
    shortLabel: 'Tier 1 · Below Minimum',
    title: 'Critical Memory Limit (Not Recommended)',
    badgeLabel: 'Tier 1 · High Crash Risk',
    severity: 'danger',
    targetHardware:
      'Entry-level or legacy smartphones and older tablets with ~1 GB RAM or less and single/dual-core processors.',
    browserReality:
      'Severely restricted JS heap (~50–100 MB) and legacy browser engine with minimal headroom for WebAssembly SQLite or image decoding.',
    workloadProfile:
      'Likely to freeze or crash almost immediately during multi-generation pedigree .ZIP imports or photo-heavy backups.',
    cautionNotice:
      'This device falls below minimum hardware requirements. Importing large pedigree archives or photo sets may cause your browser tab to freeze or crash due to memory limits. Use Compact photo compression, keep herds small, or run heavy imports on a newer phone or computer.',
    maxRecommendedRecords: 1000,
    recommendedImagePreset: 'compact',
    recommendedDefaultGenerations: 3,
    homeClosable: false,
    settingsClosable: false,
    canReopenInSettings: false,
  },
  2: {
    tier: 2,
    slug: 'survival-baseline',
    shortLabel: 'Tier 2 · Survival Mode',
    title: 'Compact / Low-Memory Baseline (Survival Mode)',
    badgeLabel: 'Tier 2 · Low Memory',
    severity: 'warn',
    targetHardware:
      'Older mid-range or compact smartphones and budget tablets with 2–3 GB RAM (e.g., Galaxy S7/S8/J-series or iPhone 6/6 Plus class).',
    browserReality:
      'Tight JS heap limit (~150–250 MB) with CPU throttling during large JSON merges, archive parsing, and deep recursive ancestor lookups.',
    workloadProfile:
      'Safely supports ~4–5 base animals with full 8-generation pedigrees (~2,500 total records) and compressed photos on ~25% of entries, near the device stability threshold.',
    cautionNotice:
      'Low-memory device detected. For dependable performance on this device without unexpected tab reloads, keep local herds and imported pedigree trees under ~3,000 total records, enable Compact photo compression, and export regular backups.',
    maxRecommendedRecords: 3000,
    recommendedImagePreset: 'compact',
    recommendedDefaultGenerations: 3,
    homeClosable: true,
    settingsClosable: false,
    canReopenInSettings: false,
  },
  3: {
    tier: 3,
    slug: 'standard-mobile',
    shortLabel: 'Tier 3 · Standard Mobile',
    title: 'Mid-Tier Mobile Workhorse',
    badgeLabel: 'Tier 3 · Standard Mobile',
    severity: 'neutral',
    targetHardware:
      'Mainstream late-2010s to early-2020s smartphones with ~4 GB RAM and multi-core CPUs (e.g., Galaxy S9 / A10–A20 or iPhone 7/8/SE 2nd Gen class).',
    browserReality:
      'Stable JS heap (~500 MB) capable of handling larger livestock tables and recursive pedigree math without locking the interface.',
    workloadProfile:
      'Comfortably manages 15–20 base animals with full 8-generation pedigrees (~7,500–10,000 total records) when image compression is active.',
    cautionNotice:
      'Standard mobile operating range. Multi-generation pedigrees and compressed photo libraries run reliably on this device, though large multi-megabyte .ZIP imports may pause briefly while processing.',
    maxRecommendedRecords: 10000,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 4,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
  4: {
    tier: 4,
    slug: 'modern-mobile',
    shortLabel: 'Tier 4 · Modern Mobile',
    title: 'Modern Mobile Standard',
    badgeLabel: 'Tier 4 · Modern Mobile',
    severity: 'good',
    targetHardware:
      'Modern smartphones with 6–8 GB+ RAM (e.g., Galaxy A15/A16, Galaxy S20+, or iPhone X/11/12/13 and newer).',
    browserReality:
      'Generous JS heap allocation, fast V8/JavaScriptCore engines, and hardware-accelerated image canvas scaling.',
    workloadProfile:
      'Easily handles 50+ base animals with full 8-generation pedigrees (25,000+ total records) and extensive compressed photo galleries without slowdown.',
    cautionNotice:
      'Modern mobile hardware detected. Full herds, multi-generation pedigree trees, COI calculations, and compressed photo galleries run smoothly on this device.',
    maxRecommendedRecords: 25000,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 4,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
  5: {
    tier: 5,
    slug: 'desktop-powerhouse',
    shortLabel: 'Tier 5 · Desktop / Tablet',
    title: 'Desktop, Laptop & Tablet Class',
    badgeLabel: 'Tier 5 · High Capacity',
    severity: 'good',
    targetHardware:
      'Desktop computers, laptops, and full-size tablets with high system memory and multi-core workstation or tablet chips.',
    browserReality:
      'Abundant browser heap headroom relative to Community Pedigree’s lightweight local SQLite and IndexedDB storage footprint.',
    workloadProfile:
      'Handles commercial-scale herd exports, full multi-species photo archives, and deep recursive lookups across hundreds of base animals simultaneously.',
    cautionNotice:
      'High-capacity desktop or tablet environment detected. Large commercial herd imports, full photo backups, and multi-generation pedigree lookups run comfortably with ample headroom.',
    maxRecommendedRecords: null,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 5,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
};

export const DEVICE_CAPABILITY_TIER_LIST: DeviceTierDefinition[] = [
  DEVICE_CAPABILITY_TIERS[1],
  DEVICE_CAPABILITY_TIERS[2],
  DEVICE_CAPABILITY_TIERS[3],
  DEVICE_CAPABILITY_TIERS[4],
  DEVICE_CAPABILITY_TIERS[5],
];

const MB = 1024 * 1024;

function inferFormFactor(signals: DeviceHardwareSignals): DeviceFormFactor {
  const ua = (signals.userAgent || '').toLowerCase();
  const minScreen =
    signals.screenWidthPx !== null && signals.screenHeightPx !== null
      ? Math.min(signals.screenWidthPx, signals.screenHeightPx)
      : null;
  const maxScreen =
    signals.screenWidthPx !== null && signals.screenHeightPx !== null
      ? Math.max(signals.screenWidthPx, signals.screenHeightPx)
      : null;

  if (/ipad/.test(ua) || (/macintosh/.test(ua) && signals.maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(ua)) {
    return 'phone';
  }
  if (/android/.test(ua)) {
    // Non-mobile Android UA generally indicates a tablet or Chromebook/large screen
    if (minScreen !== null && minScreen < 600) {
      return 'phone';
    }
    return 'tablet';
  }
  if (
    /windows nt|macintosh|x11|cros/.test(ua) ||
    (!signals.coarsePointer && signals.maxTouchPoints === 0)
  ) {
    return 'desktop';
  }
  if (minScreen !== null && minScreen >= 700 && (maxScreen ?? 0) >= 960) {
    return 'tablet';
  }
  return signals.coarsePointer || signals.maxTouchPoints > 0 ? 'phone' : 'desktop';
}

function parseIosMajorVersion(ua: string): number | null {
  const match = ua.match(/(?:iphone|ipad|ipod).*os\s+(\d+)[._]/i);
  if (!match) return null;
  const ver = Number(match[1]);
  return Number.isFinite(ver) ? ver : null;
}

function parseAndroidMajorVersion(ua: string): number | null {
  const match = ua.match(/android\s+(\d+)/i);
  if (!match) return null;
  const ver = Number(match[1]);
  return Number.isFinite(ver) ? ver : null;
}

function formatSignalSummary(
  signals: DeviceHardwareSignals,
  formFactor: DeviceFormFactor
): string {
  const parts: string[] = [];
  parts.push(
    formFactor === 'desktop' ? 'Desktop/Laptop' : formFactor === 'tablet' ? 'Tablet' : 'Phone'
  );
  if (signals.deviceMemoryGb !== null) {
    parts.push(`~${signals.deviceMemoryGb} GB browser RAM`);
  }
  if (signals.hardwareConcurrency !== null) {
    parts.push(`${signals.hardwareConcurrency} CPU threads`);
  }
  if (signals.jsHeapLimitBytes !== null && signals.jsHeapLimitBytes > 0) {
    parts.push(`${Math.round(signals.jsHeapLimitBytes / MB)} MB JS heap limit`);
  }
  return parts.join(' · ');
}

/**
 * Classifies browser + hardware signals into one of the 5 Community Pedigree device tiers.
 * Never throws, and degrades gracefully to conservative mobile defaults if telemetry is missing.
 */
export function classifyDeviceCapability(
  signals: DeviceHardwareSignals
): DeviceCapabilityAssessment {
  const formFactor = inferFormFactor(signals);
  const ramGb =
    signals.deviceMemoryGb !== null && Number.isFinite(signals.deviceMemoryGb)
      ? signals.deviceMemoryGb
      : null;
  const cores =
    signals.hardwareConcurrency !== null && Number.isFinite(signals.hardwareConcurrency)
      ? signals.hardwareConcurrency
      : null;
  const heapMb =
    signals.jsHeapLimitBytes !== null && Number.isFinite(signals.jsHeapLimitBytes)
      ? signals.jsHeapLimitBytes / MB
      : null;
  const ua = signals.userAgent || '';

  let tier: DeviceCapabilityTierNumber;
  let confidence: 'measured' | 'estimated' =
    ramGb !== null || heapMb !== null ? 'measured' : 'estimated';

  if (formFactor === 'desktop') {
    if ((ramGb !== null && ramGb <= 1) || (heapMb !== null && heapMb < 130)) {
      tier = 1;
    } else if ((ramGb !== null && ramGb <= 2) || (heapMb !== null && heapMb < 280)) {
      tier = 2;
    } else if (ramGb !== null && ramGb <= 4 && cores !== null && cores <= 2) {
      tier = 3;
    } else {
      tier = 5;
    }
  } else if (formFactor === 'tablet') {
    const iosMajor = parseIosMajorVersion(ua);
    const androidMajor = parseAndroidMajorVersion(ua);
    if (
      (ramGb !== null && ramGb <= 1) ||
      (heapMb !== null && heapMb < 130) ||
      (iosMajor !== null && iosMajor <= 10) ||
      (androidMajor !== null && androidMajor <= 6 && (cores ?? 2) <= 2)
    ) {
      tier = 1;
    } else if (
      (ramGb !== null && ramGb <= 3) ||
      (heapMb !== null && heapMb < 290) ||
      (cores !== null && cores <= 2) ||
      (iosMajor !== null && iosMajor <= 13)
    ) {
      tier = 2;
    } else if (ramGb !== null && ramGb === 4 && cores !== null && cores <= 4) {
      tier = 3;
    } else {
      tier = 5;
    }
  } else {
    // Phone / handheld mobile
    if (ramGb !== null) {
      if (ramGb <= 1) {
        tier = 1;
      } else if (ramGb <= 3) {
        tier = 2;
      } else if (ramGb < 6) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else {
      // Safari iOS, Firefox Android, or privacy-restricted browser without navigator.deviceMemory
      confidence = heapMb !== null ? 'measured' : 'estimated';
      const iosMajor = parseIosMajorVersion(ua);
      const androidMajor = parseAndroidMajorVersion(ua);
      const minPx =
        signals.screenWidthPx !== null && signals.screenHeightPx !== null
          ? Math.min(signals.screenWidthPx, signals.screenHeightPx)
          : null;
      const dpr = signals.devicePixelRatio ?? null;

      if (iosMajor !== null) {
        // iOS does not expose deviceMemory; combine OS generation, viewport/DPR, and cores
        if (iosMajor <= 10 || (cores !== null && cores <= 1)) {
          tier = 1;
        } else if (
          iosMajor <= 13 ||
          (cores !== null && cores <= 2) ||
          (minPx !== null && minPx <= 375 && dpr !== null && dpr <= 2 && iosMajor <= 15)
        ) {
          tier = 2;
        } else if (
          iosMajor === 14 ||
          (cores !== null && cores <= 4) ||
          (minPx !== null && minPx <= 375 && dpr !== null && dpr <= 2)
        ) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else if (androidMajor !== null) {
        if (androidMajor <= 6 || (cores !== null && cores <= 2)) {
          tier = 1;
        } else if (androidMajor <= 9 || (cores !== null && cores <= 4)) {
          tier = 2;
        } else if (androidMajor <= 11 || (cores !== null && cores <= 6)) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else if (cores !== null) {
        if (cores <= 2) tier = 1;
        else if (cores <= 4) tier = 2;
        else if (cores <= 6) tier = 3;
        else tier = 4;
      } else {
        tier = 3;
      }
    }

    // Apply hard JS heap guardrails when performance.memory exposes a tight ceiling
    if (heapMb !== null) {
      if (heapMb < 130) {
        tier = 1;
      } else if (heapMb < 300 && tier > 2) {
        tier = 2;
      } else if (heapMb < 650 && tier > 3) {
        tier = 3;
      }
    }
  }

  const definition = DEVICE_CAPABILITY_TIERS[tier];
  return {
    tier,
    definition,
    formFactor,
    confidence,
    signalSummary: formatSignalSummary(signals, formFactor),
    signals,
    shouldApplyLowMemoryHandling: tier <= 2,
  };
}

/**
 * Evaluates current barn record counts (or projected post-import counts) against the
 * detected tier's safe working threshold.
 */
export function evaluateBarnWorkloadForTier(
  totalRecords: number,
  assessment: DeviceCapabilityAssessment
): BarnWorkloadEvaluation {
  const safeTotal = Math.max(0, Math.round(Number(totalRecords) || 0));
  const limit = assessment.definition.maxRecommendedRecords;
  if (limit === null || limit <= 0) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: null,
      utilizationPercent: null,
      status: 'ok',
      guidance: null,
    };
  }

  const pct = Math.min(999, Math.round((safeTotal / limit) * 100));
  if (safeTotal > limit) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: limit,
      utilizationPercent: pct,
      status: 'over_limit',
      guidance: `Local database size (${safeTotal.toLocaleString()} records) exceeds this ${assessment.definition.shortLabel} device's ~${limit.toLocaleString()}-record comfort limit. Enable Compact photos, avoid loading unnecessary photos on printed pedigrees, and keep recent backups exported.`,
    };
  }
  if (safeTotal >= Math.round(limit * 0.75)) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: limit,
      utilizationPercent: pct,
      status: 'approaching_limit',
      guidance: `Local database (${safeTotal.toLocaleString()} / ~${limit.toLocaleString()} recommended records) is approaching this device's memory ceiling (${pct}%). Compact photo optimization is recommended.`,
    };
  }
  return {
    totalRecords: safeTotal,
    maxRecommendedRecords: limit,
    utilizationPercent: pct,
    status: 'ok',
    guidance: null,
  };
}

/**
 * Returns a settings patch when a Tier 1 or Tier 2 device is not yet using
 * low-memory presets, or `null` if low-memory settings are already active.
 */
export function buildLowMemorySettingsPatch(
  settings: Pick<
    BarnSettings,
    'imageOptimizationPreset' | 'defaultGenerations' | 'includePhotoOnPedigree'
  >,
  assessment: DeviceCapabilityAssessment
): Partial<BarnSettings> | null {
  if (!assessment.shouldApplyLowMemoryHandling) return null;

  const patch: Partial<BarnSettings> = {};
  if (settings.imageOptimizationPreset !== 'compact') {
    patch.imageOptimizationPreset = 'compact';
  }
  if (settings.defaultGenerations > 3) {
    patch.defaultGenerations = 3;
  }
  if (settings.includePhotoOnPedigree) {
    patch.includePhotoOnPedigree = false;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
