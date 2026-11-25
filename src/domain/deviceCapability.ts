/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Device Capability Tiers, Hardware Detection & Memory Handling Engine
 * (`src/domain/deviceCapability.ts`).
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
import {
  assessGenericBrowserCompatibility,
  classifyGenericDeviceCapability,
  evaluateGenericWorkloadForTier,
  GENERIC_TIER_STORAGE_POLICIES,
  getGenericHeavyZipExportGate,
  getGenericTierStoragePolicy,
  type BrowserCompatibilityAssessment,
  type BrowserFeatureSignals,
  type DeviceCapabilityTierNumber,
  type DeviceFormFactor,
  type DeviceHardwareSignals,
  type DeviceTierSeverity,
  type GenericDeviceCapabilityAssessment,
  type GenericWorkloadEvaluation,
  type HeavyZipExportGate,
  type OptionalBrowserFeatureKey,
  type TierStoragePolicy,
  type UnavailableBrowserFeature,
} from '@engine/primitives/deviceCapabilityCore';

export type {
  BrowserCompatibilityAssessment,
  BrowserFeatureSignals,
  DeviceCapabilityTierNumber,
  DeviceFormFactor,
  DeviceHardwareSignals,
  DeviceTierSeverity,
  HeavyZipExportGate,
  OptionalBrowserFeatureKey,
  TierStoragePolicy,
  UnavailableBrowserFeature,
};

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

export type DeviceCapabilityAssessment =
  GenericDeviceCapabilityAssessment<DeviceTierDefinition>;

export type BarnWorkloadEvaluation = GenericWorkloadEvaluation;

export const TIER_STORAGE_POLICIES: Record<DeviceCapabilityTierNumber, TierStoragePolicy> =
  GENERIC_TIER_STORAGE_POLICIES;

export function getTierStoragePolicy(tier: DeviceCapabilityTierNumber): TierStoragePolicy {
  return getGenericTierStoragePolicy(tier);
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

/**
 * Classifies browser + hardware signals into one of the 5 Community Pedigree device tiers.
 * Never throws, and degrades gracefully to conservative mobile defaults if telemetry is missing.
 */
export function classifyDeviceCapability(
  signals: DeviceHardwareSignals
): DeviceCapabilityAssessment {
  return classifyGenericDeviceCapability(signals, DEVICE_CAPABILITY_TIERS);
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
  return evaluateGenericWorkloadForTier(safeTotal, assessment, {
    overLimitAdvice:
      limit !== null && limit > 0
        ? `Local database size (${safeTotal.toLocaleString()} records) exceeds this ${assessment.definition.shortLabel} device's ~${limit.toLocaleString()}-record comfort limit. Enable Compact photos, avoid loading unnecessary photos on printed pedigrees, and keep recent backups exported.`
        : undefined,
  });
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

/**
 * Pure TypeScript classifier evaluating browser engine age, optional API gaps,
 * WebAssembly SQLite fallback state, and memory-risk confirmation gates.
 */
export function assessBrowserCompatibility(
  signals: BrowserFeatureSignals,
  deviceTier: DeviceCapabilityTierNumber
): BrowserCompatibilityAssessment {
  return assessGenericBrowserCompatibility(signals, deviceTier);
}

/**
 * Computes the polite confirmation prompt shown before heavy `.ZIP` exports on Tier 1
 * devices, outdated browsers, or restricted no-Worker contexts.
 */
export function getHeavyZipExportGate(
  assessment: DeviceCapabilityAssessment,
  browserCompat: BrowserCompatibilityAssessment
): HeavyZipExportGate {
  return getGenericHeavyZipExportGate(assessment, browserCompat, {
    datasetLabel: 'herd',
    jsonBackupLabel: 'Timestamped Backup (.JSON)',
  });
}

