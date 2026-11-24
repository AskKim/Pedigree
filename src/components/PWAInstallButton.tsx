/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * In-App PWA Install Prompt (`PWAInstallButton`) & Offline Mode Banner (`OfflineIndicator`).
 */

import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import React, { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../storage/storageProtection';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'card' }> = ({
  variant = 'header',
}) => {
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const iosDialogRef = useAccessibleDialog({
    isOpen: showIOSGuide,
    onClose: () => setShowIOSGuide(false),
  });

  if (isInstalled) {
    return null;
  }

  if (canPromptInstall) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        title="Install Pedigree for offline barn use"
        className={
          variant === 'header'
            ? 'min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0'
            : 'min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap'
        }
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Install App
      </button>
    );
  }

  if (isIos) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'header'
              ? 'min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0'
              : 'min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap'
          }
        >
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div
            ref={iosDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Install on iPhone or iPad"
            className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-[var(--barn-ink)]">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-[var(--barn-muted)] space-y-2 list-decimal list-inside leading-relaxed">
                <li>
                  Tap the <strong className="text-[var(--barn-ink)]">Share</strong> button in the
                  Safari toolbar.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-[var(--barn-ink)]">Add to Home Screen</strong>.
                </li>
                <li>
                  Open <strong className="text-[var(--barn-ink)]">Pedigree</strong> from your home
                  screen to use it in the barn with zero cell signal.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[40px] rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-16 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl border border-[var(--barn-terracotta)]/50 bg-[var(--barn-surface)]/95 backdrop-blur-sm px-3 py-2 text-xs font-medium text-[var(--barn-ink)] shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
      <span>Offline Mode — Local SQLite database active</span>
    </div>
  );
};
