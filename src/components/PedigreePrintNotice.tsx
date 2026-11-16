/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compact inline notice displayed alongside pedigree print / export controls.
 */

import { AlertTriangle } from 'lucide-react';

interface PedigreePrintNoticeProps {
  compact?: boolean;
  className?: string;
}

export function PedigreePrintNotice({
  compact = false,
  className = '',
}: PedigreePrintNoticeProps) {
  if (compact) {
    return (
      <div
        role="note"
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/60 text-[11px] font-medium text-[var(--barn-ink)] ${className}`}
      >
        <AlertTriangle
          className="w-3 h-3 text-[var(--barn-terracotta)] shrink-0"
          aria-hidden="true"
        />
        <span>Pedigree print / export is not yet working.</span>
      </div>
    );
  }

  return (
    <div
      role="note"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/70 text-xs text-[var(--barn-ink)] ${className}`}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong>Notice:</strong> Pedigree print / export is not yet working.
      </span>
    </div>
  );
}
