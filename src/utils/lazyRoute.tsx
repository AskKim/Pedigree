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
import { logDiagnosticEvent, recordReactCrash } from '../storage/crashLogger';

type NamedModule = Record<string, unknown>;

export async function loadWithSingleRetry<T extends NamedModule>(
  loader: () => Promise<T>,
  exportName: string,
  routeLabel: string,
  retryDelayMs = 250
): Promise<{ default: React.ComponentType<any> }> {
  try {
    const mod = await loader();
    const resolved = mod[exportName];
    if (!resolved) {
      throw new Error(`Route module "${routeLabel}" did not export "${exportName}".`);
    }
    return { default: resolved as React.ComponentType<any> };
  } catch (firstErr) {
    logDiagnosticEvent({
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
      logDiagnosticEvent({
        level: 'info',
        category: 'runtime',
        message: `Corrective action: Recovered lazy route chunk "${routeLabel}" on automatic retry.`,
      });
      return { default: resolved as React.ComponentType<any> };
    } catch (retryErr) {
      logDiagnosticEvent({
        level: 'error',
        category: 'runtime',
        message: `Lazy route chunk "${routeLabel}" failed after retry`,
        error: retryErr,
      });
      throw retryErr;
    }
  }
}

export function lazyNamedRoute<TProps>(
  loader: () => Promise<NamedModule>,
  exportName: string,
  routeLabel: string
): React.LazyExoticComponent<React.ComponentType<TProps>> {
  return React.lazy(() => loadWithSingleRetry(loader, exportName, routeLabel)) as React.LazyExoticComponent<
    React.ComponentType<TProps>
  >;
}

export function RouteLoadingFallback({ label }: { label: string }) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-48 rounded-lg bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-4 w-24 rounded-lg bg-[var(--barn-subtle)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
        <div className="h-20 rounded-xl bg-[var(--barn-subtle)] animate-pulse" />
      </div>
      <p className="text-xs text-[var(--barn-muted)]">Loading {label}…</p>
    </section>
  );
}

interface RouteErrorBoundaryProps {
  routeKey: string;
  routeLabel: string;
  onNavigateHome: () => void;
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
    recordReactCrash(error, info.componentStack || '');
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return <React.Fragment key={this.state.retryNonce}>{this.props.children}</React.Fragment>;
    }

    const message = this.state.error?.message || 'Unable to load this screen.';
    const looksLikeChunkFailure = /chunk|dynamically imported module|loading css|failed to fetch/i.test(
      message
    );

    return (
      <section
        role="alert"
        className="bg-[var(--barn-surface)] border border-[var(--barn-terracotta)] rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--barn-terracotta)]" aria-hidden="true" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="font-display text-lg font-semibold">
              Could not open {this.props.routeLabel}
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              {looksLikeChunkFailure
                ? 'This screen module did not finish loading (often due to an offline connection before caching or a fresh app update). Your saved herd database is intact.'
                : 'An unexpected error interrupted this screen. Your saved offline herd database remains safe.'}
            </p>
            <p className="text-[11px] font-mono text-[var(--barn-danger)] break-words pt-1">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              this.setState((prev) => ({
                hasError: false,
                error: null,
                retryNonce: prev.retryNonce + 1,
              }))
            }
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Retry Screen
          </button>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onNavigateHome();
            }}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[var(--barn-subtle)]"
          >
            <Home className="w-3.5 h-3.5" aria-hidden="true" />
            Back to All Species
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--barn-subtle)]"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Reload App
          </button>
        </div>
      </section>
    );
  }
}
