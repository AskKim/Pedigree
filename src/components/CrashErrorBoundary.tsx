/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * React Top-Level Crash Error Boundary & Emergency Recovery / Support Export UI.
 *
 * If an unexpected render crash happens, records full diagnostics & component stack
 * synchronously, reassures the user their offline herd database is safe, and allows
 * direct recovery, reloading, or exporting logs + a copy of their data to support.
 */

import {
  AlertTriangle,
  Archive,
  Download,
  Mail,
  RefreshCw,
  RotateCcw,
  Share2,
} from 'lucide-react';
import React from 'react';
import { BarnDatabaseSnapshot } from '../core/models';
import {
  buildSupportBundleZipArchive,
  buildSupportMailtoHref,
  formatSupportReportText,
} from '../core/supportBundle';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  DEFAULT_SUPPORT_EMAIL,
  getDiagnosticConfig,
  getDiagnosticSummary,
  isMemoryLikeError,
  listDiagnosticLogs,
  recordReactCrash,
} from '../storage/crashLogger';
import {
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
} from '../storage/storageProtection';
import { purgeStaleBrowserCaches, WebSqliteAdapter } from '../storage/webSqliteAdapter';
import {
  downloadTextFile,
  shareBinaryFileOrDownload,
} from '../utils/webFileActions';

interface CrashErrorBoundaryProps {
  children: React.ReactNode;
}

interface CrashErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  showDetails: boolean;
  busy: boolean;
  includeData: boolean;
  includePhotos: boolean;
  feedback: string | null;
  mailtoHref: string | null;
}

async function loadBestAvailableSnapshotForSupport(): Promise<BarnDatabaseSnapshot | null> {
  try {
    const adapter = new WebSqliteAdapter();
    return await adapter.loadSnapshot();
  } catch {
    try {
      const rolling = await listRollingSnapshotBackups();
      if (rolling.length > 0) {
        return await loadRollingSnapshotBackup(rolling[0].key);
      }
    } catch {
      // Ignore fallback error
    }
    return null;
  }
}

export class CrashErrorBoundary extends React.Component<
  CrashErrorBoundaryProps,
  CrashErrorBoundaryState
> {
  constructor(props: CrashErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      showDetails: false,
      busy: false,
      includeData: true,
      includePhotos: true,
      feedback: null,
      mailtoHref: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CrashErrorBoundaryState> {
    const memoryFault = isMemoryLikeError(error);
    return {
      hasError: true,
      error,
      includePhotos: !memoryFault,
      feedback: null,
      mailtoHref: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const compStack = info.componentStack || '';
    recordReactCrash(error, compStack);
    this.setState({ componentStack: compStack });
  }

  private handleDownloadLogsTxt = async () => {
    this.setState({ busy: true, feedback: null });
    try {
      const entries = await listDiagnosticLogs();
      const summary = await getDiagnosticSummary(entries);
      const snapshot = await loadBestAvailableSnapshotForSupport();
      const report = formatSupportReportText(entries, summary, snapshot);
      const filename = `pedigree-crash-logs-${formatTimestampedBackupSlug()}.txt`;
      downloadTextFile(filename, report, 'text/plain');
      this.setState({
        busy: false,
        feedback: `Downloaded ${filename} (${entries.length} log entries + current app state).`,
      });
    } catch (err) {
      this.setState({
        busy: false,
        feedback: err instanceof Error ? err.message : 'Could not export text logs.',
      });
    }
  };

  private handleExportOrSendBundle = async (sendViaShare: boolean) => {
    this.setState({ busy: true, feedback: null, mailtoHref: null });
    try {
      const entries = await listDiagnosticLogs();
      const summary = await getDiagnosticSummary(entries);
      const snapshot = this.state.includeData
        ? await loadBestAvailableSnapshotForSupport()
        : null;

      const built = buildSupportBundleZipArchive({
        entries,
        summary,
        snapshot,
        includeData: this.state.includeData,
        includePhotos: this.state.includePhotos,
      });

      const cfg = getDiagnosticConfig();
      const recipient = cfg.supportEmail || DEFAULT_SUPPORT_EMAIL;
      const mailtoHref = buildSupportMailtoHref({
        recipientEmail: recipient,
        filename: built.filename,
        summary,
        includedData: built.includedData,
        includedPhotos: built.includedPhotos,
      });

      if (sendViaShare) {
        const mode = await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Crash & Support Bundle',
          text: `Support logs & data bundle for ${recipient}`,
        });
        this.setState({
          busy: false,
          mailtoHref,
          feedback:
            mode === 'shared'
              ? `Opened share sheet with ${built.filename}. You can send it directly to ${recipient}.`
              : `Saved ${built.filename}. Tap "Open Email Draft" below and attach the downloaded .ZIP to send to ${recipient}.`,
        });
      } else {
        await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Crash & Support Bundle',
        });
        this.setState({
          busy: false,
          mailtoHref,
          feedback: `Exported ${built.filename} (${built.logCount} logs${
            built.includedData ? `, ${built.animalCount} animals` : ''
          }).`,
        });
      }
    } catch (err) {
      this.setState({
        busy: false,
        feedback: err instanceof Error ? err.message : 'Could not package support bundle.',
      });
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, componentStack, showDetails, busy, includeData, includePhotos, feedback, mailtoHref } =
      this.state;
    const cfg = getDiagnosticConfig();
    const memoryFault = error ? isMemoryLikeError(error) : false;

    return (
      <main className="min-h-screen bg-[var(--barn-canvas,#f2e9da)] text-[var(--barn-ink,#241e18)] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-xl w-full bg-[var(--barn-surface,#faf5eb)] border border-[var(--barn-border,#cfc0a8)] rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--barn-terracotta-tint,#f5e1d5)] border border-[var(--barn-terracotta,#a84b28)] flex items-center justify-center shrink-0">
              <AlertTriangle
                className="w-5 h-5 text-[var(--barn-terracotta,#a84b28)]"
                aria-hidden="true"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <h1 className="font-display text-xl font-semibold">
                Something interrupted this screen
              </h1>
              <p className="text-xs text-[var(--barn-muted,#63584a)]">
                The error was logged locally with device &amp; memory diagnostics. Your saved offline
                herd database and photos remain safe in browser storage.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas,#f2e9da)] border border-[var(--barn-border,#cfc0a8)] space-y-2 text-xs">
            <div className="font-mono font-semibold text-[var(--barn-danger,#b5382b)] break-words">
              {error ? `${error.name}: ${error.message}` : 'Unexpected application error'}
            </div>
            {memoryFault && (
              <p className="text-[11px] text-[var(--barn-muted,#63584a)]">
                Memory pressure detected — photo inclusion defaults to unchecked below so the
                diagnostic export stays lightweight.
              </p>
            )}
            <button
              type="button"
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="underline text-[11px] text-[var(--barn-muted,#63584a)]"
            >
              {showDetails ? 'Hide technical details' : 'Show stack trace & component details'}
            </button>
            {showDetails && (
              <pre className="mt-2 p-2.5 rounded-lg bg-black/5 text-[10px] font-mono overflow-x-auto max-h-44 whitespace-pre-wrap break-words">
                {[error?.stack, componentStack].filter(Boolean).join('\n\n')}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                this.setState({
                  hasError: false,
                  error: null,
                  componentStack: '',
                  feedback: null,
                })
              }
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage,#2d5e3f)] text-[var(--barn-on-sage,#fff8f0)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Try Recovering Screen
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reload App
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                this.setState({ busy: true });
                try {
                  await purgeStaleBrowserCaches();
                } finally {
                  window.location.reload();
                }
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              Purge Caches &amp; Reload
            </button>
          </div>

          <div className="border-t border-[var(--barn-border,#cfc0a8)] pt-4 space-y-3">
            <div className="text-xs font-semibold">
              Export Crash Logs &amp; Send to Support ({cfg.supportEmail})
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeData}
                  onChange={(e) => this.setState({ includeData: e.target.checked })}
                />
                <span>Include a copy of my offline herd &amp; breeding data</span>
              </label>
              {includeData && (
                <label className="flex items-center gap-2 cursor-pointer pl-5 text-[var(--barn-muted,#63584a)]">
                  <input
                    type="checkbox"
                    checked={includePhotos}
                    onChange={(e) => this.setState({ includePhotos: e.target.checked })}
                  />
                  <span>Include animal photos (uncheck for smaller email attachment)</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleExportOrSendBundle(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage,#2d5e3f)] text-[var(--barn-on-sage,#fff8f0)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                {includeData ? 'Send Logs + Data Bundle' : 'Send Error Logs (.ZIP)'}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleExportOrSendBundle(false)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                Download .ZIP
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void this.handleDownloadLogsTxt()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border,#cfc0a8)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Logs Only (.TXT)
              </button>
            </div>

            {feedback && (
              <div className="p-2.5 rounded-xl bg-[var(--barn-sage-tint,#dcebd9)] border border-[var(--barn-sage,#2d5e3f)] text-xs space-y-2">
                <div>{feedback}</div>
                {mailtoHref && (
                  <a
                    href={mailtoHref}
                    className="inline-flex items-center gap-1.5 font-semibold underline text-[var(--barn-sage,#2d5e3f)]"
                  >
                    <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                    Open Email Draft to {cfg.supportEmail}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }
}
