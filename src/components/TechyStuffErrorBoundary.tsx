/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Isolated Error Boundary for "The Techy Stuff" Developer & Troubleshooting Screen.
 *
 * Ensures any fault inside diagnostic inspection, memory dump tooling, or developer
 * state tools stays strictly isolated from active breeding, herd, and pedigree views,
 * logging crash telemetry cleanly while letting users recover locally or exit safely.
 */

import { AlertTriangle, Download, Home, RefreshCw, Settings, ShieldAlert } from 'lucide-react';
import React from 'react';
import {
  getDiagnosticSummary,
  listDiagnosticLogs,
  recordReactCrash,
} from '../storage/crashLogger';
import { downloadTextFile } from '../utils/webFileActions';

interface TechyStuffErrorBoundaryProps {
  children: React.ReactNode;
  onExitToSettings: () => void;
  onExitToHome: () => void;
}

interface TechyStuffErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  showDetails: boolean;
  exportBusy: boolean;
  exportFeedback: string | null;
}

export class TechyStuffErrorBoundary extends React.Component<
  TechyStuffErrorBoundaryProps,
  TechyStuffErrorBoundaryState
> {
  constructor(props: TechyStuffErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      exportBusy: false,
      exportFeedback: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<TechyStuffErrorBoundaryState> {
    return {
      hasError: true,
      error,
      exportFeedback: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const compStack = info.componentStack || '';
    recordReactCrash(error, compStack);
    this.setState({ componentStack: compStack });
  }

  private handleResetBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      exportFeedback: null,
    });
  };

  private handleDownloadCrashLogTxt = async () => {
    this.setState({ exportBusy: true, exportFeedback: null });
    try {
      const [entries, { formatSupportReportText }, { formatTimestampedBackupSlug }] = await Promise.all([
        listDiagnosticLogs(),
        import('../domain/supportBundle'),
        import('../domain/syncAndExports'),
      ]);
      const summary = await getDiagnosticSummary(entries);
      const report = formatSupportReportText(entries, summary, null);
      const filename = `pedigree-techy-stuff-fault-${formatTimestampedBackupSlug()}.txt`;
      await downloadTextFile(filename, report, 'text/plain');
      this.setState({
        exportBusy: false,
        exportFeedback: `Downloaded ${filename} (${entries.length} diagnostic entries).`,
      });
    } catch (err) {
      this.setState({
        exportBusy: false,
        exportFeedback:
          err instanceof Error ? err.message : 'Could not export diagnostic log report.',
      });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message || 'Unexpected error inside Developer & Troubleshooting panel.';

    return (
      <section
        role="alert"
        aria-live="assertive"
        className="bg-[var(--barn-surface)] border border-[var(--barn-danger)] rounded-2xl p-6 space-y-4 max-w-3xl mx-auto"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-[var(--barn-danger)] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 min-w-0">
            <h1 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
              &ldquo;The Techy Stuff&rdquo; Diagnostic Panel Hit an Isolated Error
            </h1>
            <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
              This fault was trapped inside the Developer &amp; Troubleshooting boundary so your
              active herd records, breeding lab, and pedigrees remain completely safe and
              unaffected.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-mono text-[var(--barn-ink)] break-words">
          {message}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={this.handleResetBoundary}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Retry Developer Panel
          </button>

          <button
            type="button"
            onClick={this.props.onExitToSettings}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            Back to Settings
          </button>

          <button
            type="button"
            onClick={this.props.onExitToHome}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            All Species Home
          </button>

          <button
            type="button"
            disabled={this.state.exportBusy}
            onClick={() => void this.handleDownloadCrashLogTxt()}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {this.state.exportBusy ? 'Exporting Logs...' : 'Download Crash Logs (.TXT)'}
          </button>
        </div>

        {this.state.exportFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
          >
            {this.state.exportFeedback}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
            aria-expanded={this.state.showDetails}
            className="text-xs underline text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
          >
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {this.state.showDetails ? 'Hide Technical Stack Trace' : 'Show Technical Stack Trace'}
          </button>

          {this.state.showDetails && (
            <pre className="mt-2 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px] overflow-x-auto max-h-60 whitespace-pre-wrap break-words text-[var(--barn-muted)]">
              {this.state.error?.stack || message}
              {this.state.componentStack ? `\n\nComponent Stack:\n${this.state.componentStack}` : ''}
            </pre>
          )}
        </div>
      </section>
    );
  }
}
