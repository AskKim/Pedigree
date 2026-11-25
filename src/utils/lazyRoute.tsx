/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Route-level code splitting helpers (`lazyNamedRoute`, `RouteLoadingFallback`,
 * and `RouteErrorBoundary`) to reduce startup JS parse/compile memory on mobile devices
 * while keeping chunk-fetch failures recoverable offline and online.
 */

import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';
import React from 'react';

type NamedModule = Record<string, unknown>;

const DEFAULT_CHUNK_RELOAD_SESSION_KEY = 'app_chunk_reload_ts';
const DEFAULT_PENDING_BOOT_SESSION_KEY = 'app_pending_boot_ts';
const DEFAULT_CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export interface LazyRouteDiagnosticEntry {
  level: 'info' | 'warn' | 'error';
  category: 'runtime';
  message: string;
  error?: unknown;
}

export interface ChunkReloadOptions {
  reloadSessionKey?: string;
  pendingBootSessionKey?: string;
  cooldownMs?: number;
  onDiagnosticEvent?: (entry: LazyRouteDiagnosticEntry) => void;
  onCleanSessionExit?: () => void;
  onReactCrash?: (error: Error, componentStack: string) => void;
}

const noopDiagnostic = (_entry: LazyRouteDiagnosticEntry): void => {};
const noopCleanExit = (): void => {};
const noopReactCrash = (_error: Error, _componentStack: string): void => {};

let activeChunkReloadDefaults: Required<ChunkReloadOptions> = {
  reloadSessionKey: DEFAULT_CHUNK_RELOAD_SESSION_KEY,
  pendingBootSessionKey: DEFAULT_PENDING_BOOT_SESSION_KEY,
  cooldownMs: DEFAULT_CHUNK_RELOAD_COOLDOWN_MS,
  onDiagnosticEvent: noopDiagnostic,
  onCleanSessionExit: noopCleanExit,
  onReactCrash: noopReactCrash,
};

export function configureLazyRouteDefaults(overrides: ChunkReloadOptions): void {
  activeChunkReloadDefaults = {
    reloadSessionKey: overrides.reloadSessionKey || activeChunkReloadDefaults.reloadSessionKey,
    pendingBootSessionKey:
      overrides.pendingBootSessionKey || activeChunkReloadDefaults.pendingBootSessionKey,
    cooldownMs:
      typeof overrides.cooldownMs === 'number' && Number.isFinite(overrides.cooldownMs)
        ? Math.max(0, overrides.cooldownMs)
        : activeChunkReloadDefaults.cooldownMs,
    onDiagnosticEvent: overrides.onDiagnosticEvent ?? activeChunkReloadDefaults.onDiagnosticEvent,
    onCleanSessionExit:
      overrides.onCleanSessionExit ?? activeChunkReloadDefaults.onCleanSessionExit,
    onReactCrash: overrides.onReactCrash ?? activeChunkReloadDefaults.onReactCrash,
  };
}

export function isRecoverableChunkError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err ?? '');
  return /outdated optimize dep|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk|loading css chunk|chunkloaderror|\b504\b/i.test(
    message
  );
}

export function attemptOneTimeChunkReload(
  routeLabel: string,
  options?: ChunkReloadOptions
): boolean {
  if (typeof window === 'undefined' || typeof window.location?.reload !== 'function') {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const reloadKey = options?.reloadSessionKey || activeChunkReloadDefaults.reloadSessionKey;
  const pendingBootKey =
    options?.pendingBootSessionKey || activeChunkReloadDefaults.pendingBootSessionKey;
  const cooldownMs =
    typeof options?.cooldownMs === 'number' && Number.isFinite(options.cooldownMs)
      ? Math.max(0, options.cooldownMs)
      : activeChunkReloadDefaults.cooldownMs;
  const onCleanExit = options?.onCleanSessionExit ?? activeChunkReloadDefaults.onCleanSessionExit;
  const onDiagnostic = options?.onDiagnosticEvent ?? activeChunkReloadDefaults.onDiagnosticEvent;

  try {
    const now = Date.now();
    const rawPrev = window.sessionStorage?.getItem(reloadKey);
    const prevTs = rawPrev ? Number(rawPrev) : 0;
    if (Number.isFinite(prevTs) && prevTs > 0 && now - prevTs < cooldownMs) {
      return false;
    }
    window.sessionStorage?.setItem(reloadKey, String(now));
    window.sessionStorage?.removeItem(pendingBootKey);
  } catch {
    return false;
  }

  onCleanExit();
  onDiagnostic({
    level: 'warn',
    category: 'runtime',
    message: `Corrective action: Reloading app once to refresh outdated module chunk for "${routeLabel}".`,
  });
  window.location.reload();
  return true;
}

export async function loadWithSingleRetry<T extends NamedModule, TProps = Record<string, never>>(
  loader: () => Promise<T>,
  exportName: string,
  routeLabel: string,
  retryDelayMs = 250
): Promise<{ default: React.ComponentType<TProps> }> {
  try {
    const mod = await loader();
    const resolved = mod[exportName];
    if (!resolved) {
      throw new Error(`Route module "${routeLabel}" did not export "${exportName}".`);
    }
    return { default: resolved as React.ComponentType<TProps> };
  } catch (firstErr) {
    activeChunkReloadDefaults.onDiagnosticEvent({
      level: 'warn',
      category: 'runtime',
      message: `Lazy route chunk load retry for "${routeLabel}"`,
      error: firstErr,
    });
    if (retryDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, retryDelayMs);
      });
    }
    try {
      const mod = await loader();
      const resolved = mod[exportName];
      if (!resolved) {
        throw new Error(`Route module "${routeLabel}" did not export "${exportName}".`);
      }
      activeChunkReloadDefaults.onDiagnosticEvent({
        level: 'info',
        category: 'runtime',
        message: `Corrective action: Recovered lazy route chunk "${routeLabel}" on automatic retry.`,
      });
      return { default: resolved as React.ComponentType<TProps> };
    } catch (retryErr) {
      activeChunkReloadDefaults.onDiagnosticEvent({
        level: 'error',
        category: 'runtime',
        message: `Lazy route chunk "${routeLabel}" failed after retry`,
        error: retryErr,
      });
      if (isRecoverableChunkError(retryErr)) {
        attemptOneTimeChunkReload(routeLabel);
      }
      throw retryErr;
    }
  }
}

export function lazyNamedRoute<TProps>(
  loader: () => Promise<NamedModule>,
  exportName: string,
  routeLabel: string
): React.LazyExoticComponent<React.ComponentType<TProps>> {
  return React.lazy(() => loadWithSingleRetry<NamedModule, TProps>(loader, exportName, routeLabel));
}

export function RouteLoadingFallback({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      className="bg-[var(--ui-surface)] border border-[var(--ui-border)] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-48 rounded-lg bg-[var(--ui-subtle)] animate-pulse" />
        <div className="h-4 w-24 rounded-lg bg-[var(--ui-subtle)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-[var(--ui-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--ui-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--ui-subtle)] animate-pulse" />
      </div>
      <p className="text-xs text-[var(--ui-muted)]">Loading {label}…</p>
    </section>
  );
}

interface RouteErrorBoundaryProps {
  routeKey: string;
  routeLabel: string;
  onNavigateHome?: () => void;
  homeButtonLabel?: string;
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryNonce: number;
}

export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryNonce: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps): void {
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    activeChunkReloadDefaults.onReactCrash(error, info.componentStack || '');
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.retryNonce}>{this.props.children}</React.Fragment>;
    }

    const message = this.state.error?.message || 'Unable to load this screen.';
    const looksLikeChunkFailure = isRecoverableChunkError(this.state.error);

    return (
      <section
        role="alert"
        className="bg-[var(--ui-surface)] border border-[var(--ui-accent)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ui-accent-tint)] border border-[var(--ui-accent)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--ui-accent)]" aria-hidden="true" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-lg font-semibold">
              Could not open {this.props.routeLabel}
            </h2>
            <p className="text-xs text-[var(--ui-muted)]">
              {looksLikeChunkFailure
                ? 'This screen module did not finish loading (often due to an offline connection before caching or a fresh app update). Your saved offline database is intact.'
                : 'An unexpected error interrupted this screen. Your saved offline database remains safe.'}
            </p>
            <p className="text-[11px] font-mono text-[var(--ui-danger)] break-words pt-1">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (looksLikeChunkFailure && typeof window !== 'undefined') {
                activeChunkReloadDefaults.onCleanSessionExit();
                window.location.reload();
                return;
              }
              this.setState((prev) => ({
                hasError: false,
                error: null,
                retryNonce: prev.retryNonce + 1,
              }));
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--ui-primary)] text-[var(--ui-on-primary)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry Screen
          </button>
          {this.props.onNavigateHome && (
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onNavigateHome?.();
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--ui-border)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--ui-subtle)]"
            >
              <Home className="w-3.5 h-3.5" aria-hidden="true" />
              {this.props.homeButtonLabel ?? 'Back to Home'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              activeChunkReloadDefaults.onCleanSessionExit();
              window.location.reload();
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--ui-border)] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--ui-subtle)]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Reload App
          </button>
        </div>
      </section>
    );
  }
}
