/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Optional Cloud App-Folder Sync Panel (`Google Drive AppFolder` / `OneDrive approot`)
 * & 403/507 Quota Circuit Breaker Status Controls (`CloudAppFolderSyncPanel.tsx`).
 */

import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import React, { useId, useState } from 'react';
import {
  CLOUD_SYNC_PROVIDER_DESCRIPTORS,
  CloudSyncProvider,
  CloudSyncSettings,
  NORMAL_DELTA_CHUNK_MAX_OPS,
  TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS,
} from '../core/cloudAppFolderSync';
import type { DeviceCapabilityTierNumber } from '../core/deviceCapability';
import type {
  CloudSyncClientState,
  RunCloudAppFolderSyncResult,
} from '../storage/cloudAppFolderSync';
import { StorageProtectionStatus, useConnectivityStatus } from '../storage/storageProtection';

interface CloudAppFolderSyncPanelProps {
  cloudSyncState: CloudSyncClientState;
  cloudSyncBusy: boolean;
  storageStatus?: StorageProtectionStatus | null;
  deviceTier?: DeviceCapabilityTierNumber;
  onUpdateSettings: (patch: Partial<CloudSyncSettings>) => void;
  onConnectToken: (provider: CloudSyncProvider, accessToken: string) => boolean;
  onDisconnect: (provider?: CloudSyncProvider) => void;
  onStartPkce?: (provider: CloudSyncProvider, clientId: string) => Promise<void>;
  onSyncNow: () => Promise<RunCloudAppFolderSyncResult>;
  onResetAndRetry: () => Promise<RunCloudAppFolderSyncResult>;
  onDismissWarning?: () => void;
}

export function CloudAppFolderSyncPanel({
  cloudSyncState,
  cloudSyncBusy,
  storageStatus = null,
  deviceTier,
  onUpdateSettings,
  onConnectToken,
  onDisconnect,
  onStartPkce,
  onSyncNow,
  onResetAndRetry,
  onDismissWarning,
}: CloudAppFolderSyncPanelProps) {
  const baseId = useId();
  const connectivity = useConnectivityStatus();
  const { settings, circuitBreaker, status, hasMemoryTokenByProvider } = cloudSyncState;
  const providerInfo = CLOUD_SYNC_PROVIDER_DESCRIPTORS[settings.provider];
  const hasToken = hasMemoryTokenByProvider[settings.provider];

  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showPkceForm, setShowPkceForm] = useState(false);
  const [pkceClientId, setPkceClientId] = useState(settings.customOAuthClientId || '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);

  const storagePercent =
    storageStatus && storageStatus.supported && storageStatus.quotaBytes > 0
      ? Math.round(storageStatus.percentUsed)
      : null;
  const isTightMode =
    (storagePercent !== null && storagePercent >= settings.storageTightThresholdPercent) ||
    (typeof deviceTier === 'number' && deviceTier <= 2);

  const handleConnectToken = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setLocalFeedback(null);
    const trimmed = tokenInput.trim();
    if (trimmed.length < 12) {
      setLocalError('Paste a valid OAuth Bearer access token (held strictly in memory).');
      return;
    }
    const ok = onConnectToken(settings.provider, trimmed);
    if (ok) {
      setTokenInput('');
      setShowTokenInput(false);
      setLocalFeedback(
        `${providerInfo.label} token connected in memory. Ready to sync isolated folder ${providerInfo.folderName}.`
      );
    }
  };

  const handleStartPkce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onStartPkce) return;
    setLocalError(null);
    try {
      await onStartPkce(settings.provider, pkceClientId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not launch OAuth PKCE redirect.');
    }
  };

  const handleManualSync = async () => {
    setLocalError(null);
    setLocalFeedback(null);
    const res = await onSyncNow();
    if (res.ok) {
      setLocalFeedback(
        `Synced ${res.uploadedOpsCount} delta op(s) across ${res.uploadedChunksCount} ${
          res.chunkStrategy === 'tight_storage_incremental'
            ? 'tight-storage incremental '
            : ''
        }chunk(s) and pulled ${res.pulledOpsCount} remote op(s).`
      );
    } else if (res.circuitBreakerTripped) {
      setLocalError(
        res.error ||
          'Cloud quota circuit breaker tripped. Automated cloud sync paused; local IndexedDB writes are unaffected.'
      );
    } else if (res.skipReason || res.error) {
      setLocalError(res.skipReason || res.error || 'Cloud sync could not run.');
    }
  };

  const handleResetAndRetry = async () => {
    setLocalError(null);
    setLocalFeedback(null);
    const res = await onResetAndRetry();
    if (res.ok) {
      setLocalFeedback(
        `Quota circuit breaker reset. Synced ${res.uploadedOpsCount} op(s) cleanly.`
      );
    } else if (res.error || res.skipReason) {
      setLocalError(res.error || res.skipReason || 'Retry halted.');
    }
  };

  return (
    <div className="border-t border-[var(--barn-sage)]/25 pt-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Cloud className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-semibold text-[var(--barn-ink)]">
              Optional Cloud App-Folder Sync (Google Drive AppFolder / OneDrive AppRoot)
            </h3>
            <span className="text-[11px] font-mono text-[var(--barn-muted)]">
              {settings.enabled ? 'Opted In' : 'Off (Zero Cloud)'}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-[var(--barn-muted)]">
            Strictly optional personal cloud sync targeting isolated app-specific folders only.
            Local IndexedDB / SQLite saves always commit first and never wait on or roll back for
            cloud network or quota errors.
          </p>
        </div>

        <label
          htmlFor={`${baseId}-cloud-enabled`}
          className="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold cursor-pointer shrink-0"
        >
          <input
            id={`${baseId}-cloud-enabled`}
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
            className="w-4 h-4 accent-[var(--barn-sage)]"
          />
          <span>Enable Cloud App-Folder</span>
        </label>
      </div>

      {/* Persistent 403 / 507 Quota Circuit Breaker Alert */}
      {(circuitBreaker.tripped || circuitBreaker.pausedAutomatedSync) && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1 min-w-0 flex-1">
              <div className="font-semibold text-[var(--barn-ink)]">
                Cloud Quota Circuit Breaker Tripped (HTTP {circuitBreaker.statusCode ?? '403/507'}) —
                Automated Cloud Sync Paused
              </div>
              <p className="text-[11px] text-[var(--barn-ink)]/90 leading-relaxed">
                {circuitBreaker.reason ||
                  'Cloud app folder storage or rate quota was exceeded. Automated background cloud syncs are paused so local IndexedDB saves remain instant and untouched.'}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[var(--barn-muted)]">
                <span>
                  Provider:{' '}
                  {circuitBreaker.provider
                    ? CLOUD_SYNC_PROVIDER_DESCRIPTORS[circuitBreaker.provider].label
                    : providerInfo.label}
                </span>
                <span>Rolling backups pruned: {circuitBreaker.lastPrunedCount}</span>
                {circuitBreaker.trippedAtIso && <span>Tripped: {circuitBreaker.trippedAtIso}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={cloudSyncBusy || !connectivity.isEffectivelyOnline || !hasToken}
              onClick={() => void handleResetAndRetry()}
              className="min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-55"
            >
              {cloudSyncBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>Reset Circuit Breaker &amp; Retry Sync</span>
            </button>

            {onDismissWarning && !circuitBreaker.warningDismissedAtIso && (
              <button
                type="button"
                onClick={onDismissWarning}
                className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium"
              >
                Dismiss Global Banner (Keep Paused)
              </button>
            )}
          </div>
        </div>
      )}

      {settings.enabled && (
        <div className="p-4 rounded-xl bg-[var(--barn-surface)]/95 border border-[var(--barn-border)] space-y-4">
          {localError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
            >
              {localError}
            </div>
          )}

          {localFeedback && !localError && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)]"
            >
              {localFeedback}
            </div>
          )}

          {/* Provider Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {(['google_drive', 'onedrive'] as CloudSyncProvider[]).map((pid) => {
              const desc = CLOUD_SYNC_PROVIDER_DESCRIPTORS[pid];
              const active = settings.provider === pid;
              const connected = hasMemoryTokenByProvider[pid];
              return (
                <button
                  key={pid}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onUpdateSettings({ provider: pid })}
                  className={`p-3 rounded-xl border text-left transition-colors space-y-1 ${
                    active
                      ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/45'
                      : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--barn-ink)]">{desc.label}</span>
                    <span className="text-[10px] font-mono text-[var(--barn-muted)]">
                      {connected ? 'Token Active' : desc.folderName}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    {desc.shortNote}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Memory-Only Token Connection */}
          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {hasToken ? (
                  <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                ) : (
                  <CloudOff className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                )}
                <span className="font-semibold text-[var(--barn-ink)]">
                  {hasToken
                    ? `${providerInfo.label} Connected (Memory-Only Token)`
                    : `${providerInfo.label} Not Connected`}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                Scope: {providerInfo.scope}
              </span>
            </div>

            {hasToken ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)]">
                  Access token is held strictly in JS memory and cleared on tab close or 401 expiry.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDisconnect(settings.provider);
                    setLocalFeedback(null);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold"
                >
                  Clear Memory Token
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <form onSubmit={handleConnectToken} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${baseId}-cloud-token`} className="sr-only">
                      Memory-Only OAuth Access Token
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <KeyRound
                        className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        id={`${baseId}-cloud-token`}
                        type={showTokenInput ? 'text' : 'password'}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        autoComplete="off"
                        placeholder={`Paste ${providerInfo.label} OAuth access token (never persisted)`}
                        className="w-full min-h-[40px] pl-8 pr-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTokenInput((v) => !v)}
                      aria-label={showTokenInput ? 'Hide token' : 'Show token'}
                      className="min-h-[40px] min-w-[40px] rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] inline-flex items-center justify-center shrink-0"
                    >
                      {showTokenInput ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="submit"
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      Connect Token
                    </button>
                  </div>
                </form>

                {onStartPkce && (
                  <div className="pt-1 border-t border-[var(--barn-border)]/70">
                    <button
                      type="button"
                      onClick={() => setShowPkceForm((v) => !v)}
                      className="text-[11px] font-medium text-[var(--barn-sage)] underline"
                    >
                      {showPkceForm
                        ? 'Hide OAuth2 PKCE Client ID Login'
                        : 'Or sign in directly using your own OAuth2 Client ID (PKCE)'}
                    </button>

                    {showPkceForm && (
                      <form onSubmit={(e) => void handleStartPkce(e)} className="mt-2 flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={pkceClientId}
                          onChange={(e) => setPkceClientId(e.target.value)}
                          placeholder={`Your ${providerInfo.label} OAuth2 Client ID`}
                          className="flex-1 min-w-[200px] min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                        <button
                          type="submit"
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
                        >
                          Authorize via PKCE
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chunking, Tight-Storage Threshold & Retention Settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <label className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoBackgroundSync}
                onChange={(e) => onUpdateSettings({ autoBackgroundSync: e.target.checked })}
                className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
              />
              <span>
                <span className="font-semibold text-[var(--barn-ink)] block">
                  Background Auto-Sync
                </span>
                <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                  Automatically push unuploaded deltas after local IDB commits succeed.
                </span>
              </span>
            </label>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <label
                htmlFor={`${baseId}-cloud-tight-threshold`}
                className="block font-semibold text-[var(--barn-ink)]"
              >
                Tight-Storage Chunk Threshold
              </label>
              <select
                id={`${baseId}-cloud-tight-threshold`}
                value={settings.storageTightThresholdPercent}
                onChange={(e) =>
                  onUpdateSettings({ storageTightThresholdPercent: Number(e.target.value) })
                }
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
              >
                <option value={65}>65% storage used</option>
                <option value={75}>75% storage used (Default)</option>
                <option value={85}>85% storage used</option>
                <option value={90}>90% storage used</option>
              </select>
              <p className="text-[10px] text-[var(--barn-muted)]">
                {isTightMode
                  ? `Tight mode active (${TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS} ops / 48 KiB chunks)`
                  : `Normal mode (${NORMAL_DELTA_CHUNK_MAX_OPS} ops / 256 KiB chunks)`}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <label
                htmlFor={`${baseId}-cloud-retention`}
                className="block font-semibold text-[var(--barn-ink)]"
              >
                Rolling Cloud Backups Kept
              </label>
              <select
                id={`${baseId}-cloud-retention`}
                value={settings.rollingBackupRetentionCount}
                onChange={(e) =>
                  onUpdateSettings({ rollingBackupRetentionCount: Number(e.target.value) })
                }
                className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
              >
                <option value={1}>Keep newest 1 snapshot</option>
                <option value={2}>Keep newest 2 snapshots</option>
                <option value={3}>Keep newest 3 snapshots (Default)</option>
                <option value={5}>Keep newest 5 snapshots</option>
                <option value={10}>Keep newest 10 snapshots</option>
              </select>
              <p className="text-[10px] text-[var(--barn-muted)]">
                Older rolling cloud backups are pruned automatically.
              </p>
            </div>
          </div>

          {/* Sync Trigger & Telemetry Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[11px] font-mono text-[var(--barn-muted)] space-y-0.5">
              <div>
                {status.lastSuccessfulSyncAtIso
                  ? `Last synced: ${status.lastSuccessfulSyncAtIso} · ${status.lastUploadedOpsCount} up / ${status.lastPulledOpsCount} down (${status.lastChunkStrategy === 'tight_storage_incremental' ? 'tight incremental' : 'normal'} chunks)`
                  : 'No cloud sync completed in this session yet.'}
              </div>
              {status.lastError && !circuitBreaker.tripped && (
                <div className="text-[var(--barn-terracotta)] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{status.lastError}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={
                cloudSyncBusy ||
                !hasToken ||
                !connectivity.isEffectivelyOnline ||
                circuitBreaker.tripped ||
                circuitBreaker.pausedAutomatedSync
              }
              aria-busy={cloudSyncBusy}
              onClick={() => void handleManualSync()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {cloudSyncBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              )}
              <span>
                {cloudSyncBusy
                  ? 'Syncing Cloud Folder...'
                  : !connectivity.isEffectivelyOnline
                    ? 'Offline (Local Queued)'
                    : 'Sync Cloud App-Folder Now'}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
