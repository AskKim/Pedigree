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

export interface TierStoragePolicy {
  tier: DeviceCapabilityTierNumber;
  /** Cap for automated monthly snapshots in OPFS `/backups`. */
  monthlyCap: number;
  /** Cap for pre-upgrade safety snapshots in OPFS `/backups`. */
  preUpgradeCap: number;
  /** Cap for pre-reset / pre-destructive safety snapshots in OPFS `/backups`. */
  preResetCap: number;
  /** Cap for manual snapshots in OPFS `/backups`. */
  manualCap: number;
  /** Cap for migration failure recovery dumps in OPFS `/backups`. */
  recoveryDumpCap: number;
  /** Cap for IndexedDB rolling fallback snapshots. */
  rollingIdbCap: number;
  /** When true (Tiers 1–3), strip full-res `dataUrl` from 15s IDB fallback mirror & rolling snapshots to cut RAM 3–4x while preserving thumbnails & primary SQLite full-res. */
  dehydrateMirrorPhotos: boolean;
  /** Compress OPFS vault `/backups` payloads as `.vault.zip` to reduce browser disk quota pressure. */
  compressVaultBackups: boolean;
  /** Comfort ceiling (in bytes) above which raw `.JSON` / `.ZIP` / `.SQLITE` restore/import triggers a pre-flight caution on this tier. */
  maxSafeImportBytesHint: number;
  /** Keep heavy ZIP canary round-trips disabled on sub-minimum devices. */
  skipHeavyCanaryZip: boolean;
}

export const TIER_STORAGE_POLICIES: Record<DeviceCapabilityTierNumber, TierStoragePolicy> = {
  1: {
    tier: 1,
    monthlyCap: 2,
    preUpgradeCap: 1,
    preResetCap: 2,
    manualCap: 3,
    recoveryDumpCap: 2,
    rollingIdbCap: 1,
    dehydrateMirrorPhotos: true,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 8 * 1024 * 1024,
    skipHeavyCanaryZip: true,
  },
  2: {
    tier: 2,
    monthlyCap: 3,
    preUpgradeCap: 2,
    preResetCap: 3,
    manualCap: 5,
    recoveryDumpCap: 2,
    rollingIdbCap: 2,
    dehydrateMirrorPhotos: true,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 18 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  3: {
    tier: 3,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: true,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 32 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  4: {
    tier: 4,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: false,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 64 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  5: {
    tier: 5,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: false,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 64 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
};

export function getTierStoragePolicy(tier: DeviceCapabilityTierNumber): TierStoragePolicy {
  return TIER_STORAGE_POLICIES[tier] || TIER_STORAGE_POLICIES[3];
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
      '~50–100 MB JS heap; capped to 1 rolling IDB snapshot, 2 monthly vault copies, and thumbnail-only mirror redundancy.',
    workloadProfile:
      'Up to ~1,000 records. Heavy .ZIP imports, large raw DB restores, or high-res photos will likely freeze or crash the tab.',
    cautionNotice:
      'Below minimum hardware requirements. Tight vault retention (2 monthly · 3 manual · 1 rolling IDB) and thumbnail-light mirrors are enforced; connect a Backup Sync Folder or export backups off-device before heavy imports.',
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
      '~150–250 MB JS heap; uses compressed vault snapshots, thumbnail-light mirrors, and 2 rolling IDB copies.',
    workloadProfile:
      'Up to ~3,000 records (~4–5 base animals, 8-gen trees, ~25% compact photos).',
    cautionNotice:
      'Low-memory device detected. Keep local records under ~3,000, use Compact photos, and keep a Backup Sync Folder or off-device export synced (vault trims locally to 3 monthly · 5 manual copies).',
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

export type OptionalBrowserFeatureKey =
  | 'wasm'
  | 'worker'
  | 'opfs'
  | 'directoryPicker'
  | 'persistStorage'
  | 'clipboard'
  | 'webShare'
  | 'webp';

export interface BrowserFeatureSignals {
  userAgent: string;
  promiseSupported: boolean;
  indexedDbSupported: boolean;
  wasmSupported: boolean;
  moduleWorkerSupported: boolean;
  opfsSupported: boolean;
  directoryPickerSupported: boolean;
  persistStorageSupported: boolean;
  clipboardWriteSupported: boolean;
  webShareFilesSupported: boolean;
  webpEncodeSupported: boolean;
  createImageBitmapSupported: boolean;
  workerRuntimeDisabled?: boolean;
}

export interface UnavailableBrowserFeature {
  key: OptionalBrowserFeatureKey;
  label: string;
  reason: string;
  fallback: string;
}

export interface BrowserCompatibilityAssessment {
  isOutdatedBrowser: boolean;
  outdatedReasons: string[];
  wasmFallbackActive: boolean;
  shouldConfirmHeavyZipExport: boolean;
  heavyZipCautionReason: string | null;
  signals: BrowserFeatureSignals;
  unavailableFeatures: UnavailableBrowserFeature[];
}

export interface HeavyZipExportGate {
  requiresConfirmation: boolean;
  title: string;
  body: string;
  advice: string;
}

function parseBrowserEngineMajors(ua: string): {
  chromeMajor: number | null;
  firefoxMajor: number | null;
  safariMajor: number | null;
  iosMajor: number | null;
  androidMajor: number | null;
} {
  const iosMajor = parseIosMajorVersion(ua);
  const androidMajor = parseAndroidMajorVersion(ua);

  const fxMatch = ua.match(/firefox\/(\d+)/i);
  const firefoxMajor = fxMatch ? Number(fxMatch[1]) : null;

  const crMatch = ua.match(/(?:chrome|crios|edg|edga|edgios)\/(\d+)/i);
  const chromeMajor = crMatch ? Number(crMatch[1]) : null;

  const isSafariLike =
    /safari/i.test(ua) && !/chrome|crios|chromium|edg|edga|edgios|fxios|firefox|opr\//i.test(ua);
  const sfMatch = isSafariLike ? ua.match(/version\/(\d+)/i) : null;
  const safariMajor = sfMatch ? Number(sfMatch[1]) : null;

  return {
    chromeMajor: chromeMajor !== null && Number.isFinite(chromeMajor) ? chromeMajor : null,
    firefoxMajor: firefoxMajor !== null && Number.isFinite(firefoxMajor) ? firefoxMajor : null,
    safariMajor: safariMajor !== null && Number.isFinite(safariMajor) ? safariMajor : null,
    iosMajor,
    androidMajor,
  };
}

/**
 * Pure TypeScript classifier evaluating browser engine age, optional API gaps,
 * WebAssembly SQLite fallback state, and memory-risk confirmation gates.
 */
export function assessBrowserCompatibility(
  signals: BrowserFeatureSignals,
  deviceTier: DeviceCapabilityTierNumber
): BrowserCompatibilityAssessment {
  const ua = signals.userAgent || '';
  const { chromeMajor, firefoxMajor, safariMajor, iosMajor, androidMajor } =
    parseBrowserEngineMajors(ua);

  const outdatedReasons: string[] = [];

  if (iosMajor !== null && iosMajor < 15) {
    outdatedReasons.push(`Older iOS version (iOS ${iosMajor}) with tighter WebKit limits`);
  }
  if (safariMajor !== null && safariMajor < 15) {
    outdatedReasons.push(`Older Safari engine (Safari ${safariMajor})`);
  }
  if (chromeMajor !== null && chromeMajor < 95) {
    outdatedReasons.push(`Older Chromium-based browser (v${chromeMajor})`);
  }
  if (firefoxMajor !== null && firefoxMajor < 102) {
    outdatedReasons.push(`Older Firefox version (v${firefoxMajor})`);
  }
  if (androidMajor !== null && androidMajor < 10) {
    outdatedReasons.push(`Older Android WebView/OS (Android ${androidMajor})`);
  }
  if (!signals.webpEncodeSupported) {
    outdatedReasons.push('Browser canvas lacks WebP encoding (falling back to JPEG compression)');
  }
  if (!signals.createImageBitmapSupported) {
    outdatedReasons.push('Browser lacks hardware createImageBitmap (using classic image decoder)');
  }

  const isOutdatedBrowser = outdatedReasons.length > 0;
  const wasmFallbackActive = !signals.wasmSupported;
  const workerFallbackActive =
    !signals.moduleWorkerSupported || Boolean(signals.workerRuntimeDisabled);

  const unavailableFeatures: UnavailableBrowserFeature[] = [];

  if (!signals.wasmSupported) {
    unavailableFeatures.push({
      key: 'wasm',
      label: 'WebAssembly SQLite Engine',
      reason: 'WebAssembly is disabled or unsupported in this browser environment.',
      fallback: 'Running safely in IndexedDB JSON mode; use Timestamped Backup (.JSON).',
    });
  }
  if (workerFallbackActive) {
    unavailableFeatures.push({
      key: 'worker',
      label: 'Background Archive Worker',
      reason: 'Background module Web Workers are unavailable or blocked here.',
      fallback: 'Processing archives asynchronously on the main browser tab thread.',
    });
  }
  if (!signals.opfsSupported) {
    unavailableFeatures.push({
      key: 'opfs',
      label: 'OPFS On-Device Vault',
      reason: 'Origin Private File System storage is unsupported in this browser version.',
      fallback: 'Retaining rolling fallback snapshots inside IndexedDB instead.',
    });
  }
  if (!signals.directoryPickerSupported) {
    unavailableFeatures.push({
      key: 'directoryPicker',
      label: 'Direct Local Folder Picker',
      reason: 'Direct folder access (showDirectoryPicker) is unsupported in this browser.',
      fallback: 'Use Share / Export Worker Delta and Timestamped Backup (.JSON) files instead.',
    });
  }
  if (!signals.persistStorageSupported) {
    unavailableFeatures.push({
      key: 'persistStorage',
      label: 'Persistent Storage Lock',
      reason: 'Manual persistent storage locking is not exposed by this browser.',
      fallback: 'Storage eviction protection is managed automatically by your browser/OS.',
    });
  }
  if (!signals.clipboardWriteSupported) {
    unavailableFeatures.push({
      key: 'clipboard',
      label: 'One-Tap Clipboard Access',
      reason: 'Programmatic clipboard access is blocked or unsupported in this context.',
      fallback: 'Download the text/Markdown report file or copy from the inline text box.',
    });
  }
  if (!signals.webShareFilesSupported) {
    unavailableFeatures.push({
      key: 'webShare',
      label: 'Native Share Sheet (Files)',
      reason: 'Native file sharing is unavailable on this browser.',
      fallback: 'Buttons automatically trigger a standard file download instead.',
    });
  }
  if (!signals.webpEncodeSupported) {
    unavailableFeatures.push({
      key: 'webp',
      label: 'WebP Photo Compression',
      reason: 'Canvas WebP encoding is unavailable on this browser version.',
      fallback: 'Automatically compressing photos to compatible JPEG format.',
    });
  }

  const shouldConfirmHeavyZipExport =
    deviceTier === 1 || isOutdatedBrowser || workerFallbackActive;

  let heavyZipCautionReason: string | null = null;
  if (shouldConfirmHeavyZipExport) {
    if (deviceTier === 1 && isOutdatedBrowser) {
      heavyZipCautionReason =
        'You appear to be on a lower-memory (Tier 1) device with an older browser version, so building a compressed .ZIP photo archive may run out of memory and close the tab.';
    } else if (deviceTier === 1) {
      heavyZipCautionReason =
        'This Tier 1 device has very limited memory (≤1 GB RAM), so building a compressed .ZIP archive with photos may exhaust tab memory.';
    } else if (isOutdatedBrowser) {
      heavyZipCautionReason =
        'You appear to be using an older browser version, where building large compressed .ZIP photo archives is more likely to run out of memory.';
    } else {
      heavyZipCautionReason =
        'Background archive Workers are unavailable in this browser, so .ZIP compression runs inside the main page tab and may struggle on large photo sets.';
    }
  }

  return {
    isOutdatedBrowser,
    outdatedReasons,
    wasmFallbackActive,
    shouldConfirmHeavyZipExport,
    heavyZipCautionReason,
    signals,
    unavailableFeatures,
  };
}

/**
 * Computes the polite confirmation prompt shown before heavy `.ZIP` exports on Tier 1
 * devices, outdated browsers, or restricted no-Worker contexts.
 */
export function getHeavyZipExportGate(
  assessment: DeviceCapabilityAssessment,
  browserCompat: BrowserCompatibilityAssessment
): HeavyZipExportGate {
  const requiresConfirmation =
    assessment.tier === 1 || browserCompat.shouldConfirmHeavyZipExport;

  if (!requiresConfirmation) {
    return {
      requiresConfirmation: false,
      title: '',
      body: '',
      advice: '',
    };
  }

  return {
    requiresConfirmation: true,
    title: 'Memory Caution for Older or Lower-Memory Device',
    body:
      browserCompat.heavyZipCautionReason ||
      'Your device or browser may have limited memory for building large compressed .ZIP files.',
    advice:
      'You can still try creating the .ZIP archive below. If it fails or reloads the page, please use Timestamped Backup (.JSON) instead — it safely backs up your herd using much less memory because of your older device or browser.',
  };
}

