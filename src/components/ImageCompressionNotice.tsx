/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
      role="note"
      className={`flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/60 text-[11px] text-[var(--barn-ink)] ${className}`}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong>Low-power devices:</strong> If any device using your farm or livestock data is
        older or low-power, select the smallest, most compressed file size you can tolerate — excess
        image size can cause memory trouble in stored data on those devices.
      </span>
    </div>
  );
}
