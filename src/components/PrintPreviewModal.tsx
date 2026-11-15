/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-App Document & Thermal Label Print Preview Modal.
 *
 * Renders generated `.HTM` pedigrees and 4"x2" cage cards inside an isolated `<iframe srcDoc>`
 * so breeders can print directly to PDF or thermal label printers (`contentWindow.print()`) or
 * download the standalone `.HTM` file without relying on `window.open`.
 */

import { Download, Printer, X } from 'lucide-react';
import { useRef } from 'react';
import { downloadTextFile } from '../utils/webFileActions';

interface PrintPreviewModalProps {
  title: string;
  filename: string;
  htmlContent: string;
  includePrimaryPhoto?: boolean;
  onToggleIncludePrimaryPhoto?: (include: boolean) => void;
  onClose: () => void;
}

export function PrintPreviewModal({
  title,
  filename,
  htmlContent,
  includePrimaryPhoto,
  onToggleIncludePrimaryPhoto,
  onClose,
}: PrintPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  };

  const handleDownloadHtm = () => {
    downloadTextFile(filename, htmlContent, 'text/html');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--barn-border)]">
          <h2 className="text-base font-semibold truncate">{title}</h2>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onToggleIncludePrimaryPhoto && (
              <label className="min-h-[40px] px-3 py-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(includePrimaryPhoto)}
                  onChange={(e) => onToggleIncludePrimaryPhoto(e.target.checked)}
                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>Include Primary Photo</span>
              </label>
            )}
            <button
              type="button"
              onClick={handleDownloadHtm}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Download .HTM
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-neutral-200 dark:bg-neutral-900 p-4 overflow-hidden">
          <iframe
            ref={iframeRef}
            title={title}
            srcDoc={htmlContent}
            className="w-full h-full bg-white rounded-lg border border-neutral-300"
          />
        </div>
      </div>
    </div>
  );
}
