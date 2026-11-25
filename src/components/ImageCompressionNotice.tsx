/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compact inline notice displayed alongside image compression level selectors.
 */

import { AlertTriangle } from 'lucide-react';

interface ImageCompressionNoticeProps {
  className?: string;
}

export function ImageCompressionNotice({ className = '' }: ImageCompressionNoticeProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-[var(--barn-danger)]/10 border-2 border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] shadow-xs ${className}`}
    >
      <AlertTriangle
        className="w-5 h-5 text-[var(--barn-danger)] mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="space-y-0.5 leading-snug">
        <div className="font-bold uppercase tracking-wide text-[11px] text-[var(--barn-danger)]">
          Low-Power Device &amp; Storage Warning
        </div>
        <p className="font-medium text-[var(--barn-ink)]">
          If any device sharing or viewing your barn data is older or low-memory, choose the
          smallest compressed preset (<strong>Compact · 960px</strong>) you can tolerate — oversized
          photos can quickly fill browser storage or trigger mobile out-of-memory crashes.
        </p>
      </div>
    </div>
  );
}
