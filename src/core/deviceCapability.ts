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
 * - Tier 1: Critical Memory Limit — locked visible on Home & Settings
 * - Tier 2: Low-Memory Baseline (Survival Mode) — closable on Home, persistent in Settings
 * - Tier 3: Mid-Tier Mobile & Tablet — closable on Home & Settings, reopenable from Settings
 * - Tier 4: Modern Mobile & Pro Tablet — closable on Home & Settings, reopenable from Settings
 * - Tier 5: Desktop & Laptop Class — closable on Home & Settings, reopenable from Settings
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
    title: 'Critical Memory Limit',
    badgeLabel: 'Tier 1 · High Crash Risk',
    severity: 'danger',
    targetHardware:
      '≤1 GB RAM · Legacy or kids phones & tablets (e.g., Fire 7, older 1 GB Android/iPad).',
    browserReality:
      '~50–100 MB JS heap; very little room for SQLite or photo decoding.',
    workloadProfile:
      'Up to ~1,000 records. Heavy .ZIP imports or photos will likely freeze or crash the tab.',
    cautionNotice:
      'Below minimum hardware requirements. Large imports or photos may crash this tab—use Compact photos and run big .ZIP imports on a newer device.',
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
    title: 'Low-Memory Baseline (Survival Mode)',
    badgeLabel: 'Tier 2 · Low Memory',
    severity: 'warn',
    targetHardware:
      '2–3 GB RAM · Budget/older phones & tablets (e.g., Galaxy S7/J-series, iPhone 6, Fire HD 8/10, Galaxy Tab A7 Lite, iPad 6th Gen).',
    browserReality:
      '~150–250 MB JS heap; large JSON merges or deep trees can feel sluggish.',
    workloadProfile:
      'Up to ~3,000 records (~4–5 base animals, 8-gen trees, ~25% compact photos).',
    cautionNotice:
      'Low-memory device detected. Keep local records under ~3,000, use Compact photos, and export regular backups.',
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
    shortLabel: 'Tier 3 · Mid-Tier Mobile',
    title: 'Mid-Tier Mobile & Tablet',
    badgeLabel: 'Tier 3 · Mid-Tier Mobile',
    severity: 'neutral',
    targetHardware:
      '4 GB RAM · Mainstream phones & mid-range tablets (e.g., Galaxy A10–A20, iPhone 7/8/SE 2, Galaxy Tab A8/A9, iPad 9th Gen).',
    browserReality:
      '~500 MB JS heap; steady performance for daily barn logs and pedigree trees.',
    workloadProfile:
      'Up to ~10,000 records (15–20 base animals, 8-gen trees, compressed photos).',
    cautionNotice:
      'Mid-tier mobile hardware detected. Multi-generation pedigrees and compressed photos run reliably; large .ZIP imports may pause briefly.',
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
    title: 'Modern Mobile & Pro Tablet',
    badgeLabel: 'Tier 4 · Modern Mobile',
    severity: 'good',
    targetHardware:
      '6–8 GB+ RAM · Modern phones & flagship tablets (e.g., Galaxy S20+/A15+, iPhone 11+, Galaxy Tab S8/S9, iPad Air/Pro M-series).',
    browserReality:
      'Generous mobile JS heap with hardware-accelerated image canvas scaling.',
    workloadProfile:
      '25,000+ records (50+ base animals, 8-gen trees, full compressed photo galleries).',
    cautionNotice:
      'Modern mobile or pro tablet hardware detected. Full herds, COI math, and compressed photo galleries run smoothly.',
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
    shortLabel: 'Tier 5 · Desktop / Laptop',
    title: 'Desktop & Laptop Class',
    badgeLabel: 'Tier 5 · Desktop / Laptop',
    severity: 'good',
    targetHardware:
      '8–16 GB+ RAM · Windows, Mac, Linux & Chromebook PCs with desktop-class CPUs.',
    browserReality:
      'Full desktop browser memory headroom for SQLite, IndexedDB, and bulk archives.',
    workloadProfile:
      'Commercial-scale herds, multi-species photo backups, and bulk .ZIP imports across hundreds of animals.',
    cautionNotice:
      'Desktop or laptop environment detected. Large commercial imports, full photo archives, and deep pedigree lookups run with ample headroom.',
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
    } else if (iosMajor !== null) {
      if (iosMajor <= 10 || (cores !== null && cores <= 1)) {
        tier = 1;
      } else if (iosMajor <= 13 || (cores !== null && cores <= 2)) {
        tier = 2;
      } else if (iosMajor <= 15 || (cores !== null && cores <= 4)) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else if (androidMajor !== null) {
      if (androidMajor <= 6 || (cores !== null && cores <= 2)) {
        tier = 1;
      } else if (androidMajor <= 9 || (cores !== null && cores <= 4)) {
        tier = 2;
      } else if (androidMajor <= 12 || (cores !== null && cores <= 6)) {
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

    if (heapMb !== null) {
      if (heapMb < 130) {
        tier = 1;
      } else if (heapMb < 300 && tier > 2) {
        tier = 2;
      } else if (heapMb < 650 && tier > 3) {
        tier = 3;
      }
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
