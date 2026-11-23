/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Device Capability Detection & Memory Handling Banner/Section (`DeviceCapabilityCard`).
 *
 * Placement & Persistence Rules:
 * - Tier 1 (Critical Memory Limit): Locked visible in BOTH Home onboarding and Settings (not closable).
 * - Tier 2 (Survival Mode): Closable on Home screen; persistent (not closable) in Settings.
 * - Tiers 3–5 (Mid-Tier & Better): Closable in both locations and reopenable anytime from Settings.
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Monitor,
  ShieldAlert,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { useId, useState } from 'react';
import {
  buildLowMemorySettingsPatch,
  DEVICE_CAPABILITY_TIER_LIST,
  evaluateBarnWorkloadForTier,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import { BarnSettings } from '../core/models';
import { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';

interface DeviceCapabilityCardProps {
  location: 'home' | 'settings';
  controller: DeviceCapabilityController;
  settings: BarnSettings;
  totalBarnRecords: number;
  isOnboardingActive?: boolean;
  onApplyLowMemorySettings?: (patch: Partial<BarnSettings>) => void;
  onOpenSettings?: () => void;
}

export function DeviceCapabilityCard({
  location,
  controller,
  settings,
  totalBarnRecords,
  isOnboardingActive = false,
  onApplyLowMemorySettings,
  onOpenSettings,
}: DeviceCapabilityCardProps) {
  const [showTierMatrix, setShowTierMatrix] = useState(false);
  const tierMatrixId = useId();

  const { assessment, browserCompatibility } = controller;
  const { definition, tier, formFactor, signalSummary, confidence } = assessment;

  const isVisible = location === 'home' ? controller.homeVisible : controller.settingsVisible;
  const canCloseHere =
    location === 'home' ? controller.canCloseOnHome : controller.canCloseInSettings;

  // On Home: if dismissed (Tiers 2–5), render nothing. (Tier 1 can never be dismissed.)
  if (location === 'home' && !isVisible) {
    return null;
  }

  // On Settings: if closed on Tiers 3–5, render a compact reopen strip so it can be reopened anytime.
  if (location === 'settings' && !isVisible) {
    return (
      <section
        aria-label="Device Capability Profile"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Cpu className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <span className="font-semibold text-[var(--barn-ink)]">
              Device Capability: {definition.shortLabel}
            </span>
            <span className="text-[var(--barn-muted)] ml-2 hidden sm:inline">
              {definition.title} ({signalSummary})
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={controller.reopenInSettings}
          className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] whitespace-nowrap"
        >
          Reopen Device Capability Details
        </button>
      </section>
    );
  }

  const workload = evaluateBarnWorkloadForTier(totalBarnRecords, assessment);
  const lowMemPatch = buildLowMemorySettingsPatch(settings, assessment);
  const tierPolicy = getTierStoragePolicy(tier);

  const cardSurfaceClass =
    definition.severity === 'danger'
      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-danger)]'
      : definition.severity === 'warn'
        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
        : definition.severity === 'good'
          ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
          : 'bg-[var(--barn-surface)] border-[var(--barn-border)]';

  const DeviceIcon =
    formFactor === 'desktop' ? Monitor : formFactor === 'tablet' ? Tablet : Smartphone;

  const StatusIcon =
    definition.severity === 'danger'
      ? ShieldAlert
      : definition.severity === 'warn'
        ? AlertTriangle
        : definition.severity === 'good'
          ? CheckCircle2
          : Cpu;

  const iconColorClass =
    definition.severity === 'danger'
      ? 'text-[var(--barn-danger)]'
      : definition.severity === 'warn'
        ? 'text-[var(--barn-terracotta)]'
        : 'text-[var(--barn-sage)]';

  return (
    <section
      aria-label="Device Capability & Memory Profile"
      className={`border rounded-2xl p-4 sm:p-5 space-y-3 text-xs ${cardSurfaceClass}`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <StatusIcon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColorClass}`} aria-hidden="true" />
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)]">
                {definition.badgeLabel}
              </span>
              {isOnboardingActive && location === 'home' && (
                <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                  Device Setup Check
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--barn-muted)]">
                <DeviceIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {signalSummary}
                {confidence === 'estimated' ? ' (estimated)' : ''}
              </span>
            </div>

            <h2 className="font-display text-base sm:text-lg font-semibold text-[var(--barn-ink)]">
              {definition.title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canCloseHere ? (
            <button
              type="button"
              onClick={location === 'home' ? controller.dismissOnHome : controller.dismissInSettings}
              aria-label="Close device capability notice"
              title={
                location === 'home'
                  ? 'Close notice on Home (reopen anytime in Settings)'
                  : 'Close notice (reopen anytime in Settings)'
              }
              className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium text-[var(--barn-ink)] inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Close
            </button>
          ) : (
            <span className="text-[10px] font-mono font-medium px-2 py-1 rounded-lg bg-[var(--barn-surface)]/80 border border-[var(--barn-border)] text-[var(--barn-muted)] whitespace-nowrap">
              {tier === 1 ? 'Required Notice' : 'Persistent in Settings'}
            </span>
          )}
        </div>
      </div>

      {/* Main Cleaned Caution / Capability Message */}
      <p className="text-xs leading-relaxed text-[var(--barn-ink)]">{definition.cautionNotice}</p>

      {/* Practical Browser & Pedigree Capacity Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/85 border border-[var(--barn-border)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
            Pedigree &amp; Archive Headroom
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
            {definition.workloadProfile}
          </p>
          <p className="text-[10px] font-mono text-[var(--barn-muted)]">
            Vault caps: {tierPolicy.monthlyCap} monthly · {tierPolicy.manualCap} manual ·{' '}
            {tierPolicy.rollingIdbCap} rolling IDB
            {tierPolicy.dehydrateMirrorPhotos ? ' · thumbnail-light mirror' : ''}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/85 border border-[var(--barn-border)] space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-[var(--barn-ink)]">Your Current Local Barn</span>
            <span className="font-mono tabular-nums text-[var(--barn-muted)]">
              {workload.totalRecords.toLocaleString()}
              {workload.maxRecommendedRecords
                ? ` / ~${workload.maxRecommendedRecords.toLocaleString()} rec. max`
                : ' records'}
            </span>
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
            {workload.guidance || definition.browserReality}
          </p>
        </div>
      </div>

      {/* Older Browser / Fallback Compatibility Summary */}
      {(browserCompatibility.isOutdatedBrowser ||
        browserCompatibility.wasmFallbackActive ||
        (location === 'settings' && browserCompatibility.unavailableFeatures.length > 0)) && (
        <div className="p-3 rounded-xl bg-[var(--barn-surface)]/90 border border-[var(--barn-border)] space-y-1.5 text-[11px]">
          <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2">
            <span>
              {browserCompatibility.isOutdatedBrowser
                ? 'Older Browser Compatibility Mode Active'
                : 'Browser Feature Fallbacks Active'}
            </span>
            {browserCompatibility.wasmFallbackActive && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)]">
                IndexedDB JSON Mode (No WASM)
              </span>
            )}
          </div>
          {browserCompatibility.outdatedReasons.length > 0 && (
            <p className="text-[var(--barn-muted)] leading-snug">
              {browserCompatibility.outdatedReasons.join(' · ')}. Heavy .ZIP exports show a memory
              caution prompt and recommend Timestamped Backup (.JSON) if they fail.
            </p>
          )}
          {location === 'settings' && browserCompatibility.unavailableFeatures.length > 0 && (
            <ul className="space-y-1 pt-0.5 text-[var(--barn-muted)]">
              {browserCompatibility.unavailableFeatures.slice(0, 5).map((feat) => (
                <li key={feat.key} className="leading-snug">
                  <strong className="text-[var(--barn-ink)]">{feat.label}:</strong> {feat.reason}{' '}
                  <span>{feat.fallback}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Adaptive Memory Handling Controls + Tier Comparison Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {assessment.shouldApplyLowMemoryHandling && lowMemPatch && onApplyLowMemorySettings && (
            <button
              type="button"
              onClick={() => onApplyLowMemorySettings(lowMemPatch)}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              Apply Recommended Low-Memory Settings
            </button>
          )}

          {assessment.shouldApplyLowMemoryHandling && !lowMemPatch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/60 text-[11px] font-semibold text-[var(--barn-ink)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              Low-memory protection active (Compact photos · 3-Gen default)
            </span>
          )}

          {location === 'home' && onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
            >
              Image &amp; Backup Settings
            </button>
          )}

          {location === 'settings' && controller.canCloseOnHome && controller.homeDismissed && (
            <button
              type="button"
              onClick={controller.reopenOnHome}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
            >
              Show Notice on Home Screen Again
            </button>
          )}
        </div>

        <button
          type="button"
          aria-expanded={showTierMatrix}
          aria-controls={tierMatrixId}
          onClick={() => setShowTierMatrix((prev) => !prev)}
          className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
        >
          {showTierMatrix ? 'Hide All 5 Tiers' : 'See All 5 Tiers'}
          {showTierMatrix ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Expandable 5-Tier Reference Matrix */}
      {showTierMatrix && (
        <div id={tierMatrixId} className="pt-2 border-t border-[var(--barn-border)] space-y-2">
          <div className="text-[11px] font-semibold text-[var(--barn-ink)]">
            Device Capability Tiers (Phones, Tablets &amp; Desktops)
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEVICE_CAPABILITY_TIER_LIST.map((item) => {
              const isCurrent = item.tier === tier;
              return (
                <div
                  key={item.tier}
                  className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
                    isCurrent
                      ? 'bg-[var(--barn-surface)] border-[var(--barn-sage)] ring-1 ring-[var(--barn-sage)]'
                      : 'bg-[var(--barn-surface)]/75 border-[var(--barn-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--barn-ink)]">
                      Tier {item.tier}: {item.title}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {isCurrent && (
                        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)]">
                          This Device
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-[var(--barn-muted)]">
                        {item.maxRecommendedRecords
                          ? `≤~${item.maxRecommendedRecords.toLocaleString()} rec.`
                          : 'Commercial scale'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Specs:</strong>{' '}
                    {item.targetHardware}
                  </p>
                  <p className="text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Capacity:</strong>{' '}
                    {item.workloadProfile}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--barn-muted)] leading-snug">
                    {(() => {
                      const p = getTierStoragePolicy(item.tier);
                      return `Vault caps: ${p.monthlyCap} monthly · ${p.manualCap} manual · ${p.rollingIdbCap} rolling IDB${p.dehydrateMirrorPhotos ? ' · thumbnail-light mirror' : ''}`;
                    })()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
