/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * About Community Pedigree Modal (`AboutModal.tsx`).
 * Highlights offline-first architecture, local device data ownership,
 * zero-telemetry guarantee, license details, and system quick links.
 */

import {
  BookOpen,
  Code2,
  Database,
  ExternalLink,
  FileCode2,
  HardDrive,
  Info,
  Layers,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import React from 'react';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { usePlatformBridge } from '@app/PlatformBridgeContext';

const RELEASES_URL = 'https://github.com/AskKim/Pedigree/releases';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHelpDocs?: () => void;
  onOpenTechyStuff?: () => void;
  onOpenPromptsDirectory?: () => void;
  onOpenImportExportHub?: () => void;
}

export function AboutModal({
  isOpen,
  onClose,
  onOpenHelpDocs,
  onOpenTechyStuff,
  onOpenPromptsDirectory,
  onOpenImportExportHub,
}: AboutModalProps) {
  const dialogRef = useAccessibleDialog({ isOpen, onClose });
  const platformBridge = usePlatformBridge();

  if (!isOpen) return null;

  const handleOpenReleases = () => {
    if (!platformBridge.openExternalUrl?.(RELEASES_URL) && typeof window !== 'undefined') {
      window.open(RELEASES_URL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="w-full max-w-2xl bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl shadow-2xl p-6 sm:p-7 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--barn-border)] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] flex items-center justify-center shadow-xs shrink-0">
              <Info className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="about-modal-title" className="font-display text-xl sm:text-2xl font-bold text-[var(--barn-ink)]">
                  Community Pedigree
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border border-[var(--barn-sage)]/40">
                  v0.1.0-alpha.3
                </span>
              </div>
              <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                The offline-first, multi-species livestock pedigree &amp; farm records engine.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close About dialog"
            className="w-9 h-9 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
              <HardDrive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>100% On-Device</span>
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
              Your animals, genetics, logs, and photos stay entirely on your device in SQLite &amp; OPFS.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
              <ShieldCheck className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Zero Telemetry</span>
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
              Zero mandatory cloud accounts, zero tracking pixels, and zero remote database dependencies.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
              <Code2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Open &amp; Portable</span>
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
              Export standard JSON, SQLite binary, or ZIP photo archives anytime with zero lock-in.
            </p>
          </div>
        </div>

        {/* Architecture & Tech Summary */}
        <div className="space-y-3 text-xs">
          <h3 className="font-semibold text-[var(--barn-ink)] flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Architecture &amp; Platform Invariants</span>
          </h3>
          <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-[11px] text-[var(--barn-muted)] leading-relaxed">
            <p>
              <strong className="text-[var(--barn-ink)]">Stack:</strong> Unified React + Vite + strict TypeScript PWA transpiled to ES2018 for robust compatibility across iOS, Android, and Desktop environments.
            </p>
            <p>
              <strong className="text-[var(--barn-ink)]">Storage Subsystem:</strong> In-browser SQLite WASM with Origin Private File System (OPFS) snapshot vaulting, backed by short transactional IndexedDB fallback and memory-safe chunked streaming.
            </p>
            <p>
              <strong className="text-[var(--barn-ink)]">License:</strong> Free and Open Source under the <strong className="text-[var(--barn-ink)]">GNU Affero General Public License v3.0 (AGPL-3.0-or-later)</strong>. You have the right to inspect, modify, run, and host the software independently.
            </p>
          </div>
        </div>

        {/* Quick Links Section */}
        <div className="space-y-2 text-xs">
          <h3 className="font-semibold text-[var(--barn-ink)]">
            Direct System Pages &amp; Tooling
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {onOpenHelpDocs && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenHelpDocs();
                }}
                className="p-3 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookOpen className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">Documentation &amp; Guides</div>
                    <div className="text-[10px] text-[var(--barn-muted)] truncate">Husbandry schedules &amp; core features</div>
                  </div>
                </div>
                <span className="text-xs text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0">&rarr;</span>
              </button>
            )}

            {onOpenTechyStuff && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTechyStuff();
                }}
                className="p-3 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Terminal className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">The Techy Stuff</div>
                    <div className="text-[10px] text-[var(--barn-muted)] truncate">Developer console &amp; diagnostics</div>
                  </div>
                </div>
                <span className="text-xs text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0">&rarr;</span>
              </button>
            )}

            {onOpenPromptsDirectory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPromptsDirectory();
                }}
                className="p-3 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCode2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">Prompts Directory</div>
                    <div className="text-[10px] text-[var(--barn-muted)] truncate">System instructions &amp; prompts catalog</div>
                  </div>
                </div>
                <span className="text-xs text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0">&rarr;</span>
              </button>
            )}

            {onOpenImportExportHub && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenImportExportHub();
                }}
                className="p-3 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Database className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">Import &amp; Export Hub</div>
                    <div className="text-[10px] text-[var(--barn-muted)] truncate">Backups, restores &amp; CSV mappers</div>
                  </div>
                </div>
                <span className="text-xs text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0">&rarr;</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--barn-border)]">
          <button
            type="button"
            onClick={handleOpenReleases}
            className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>GitHub Releases &amp; APK Changelogs</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
