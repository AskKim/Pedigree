import { describe, expect, it } from 'vitest';
import {
  canShareHtmlDocument,
  detectDocumentPrintOrientation,
  extractScopedPrintCssFromRawCss,
  scopePrintSelectorList,
} from '../../components/PrintPreviewModal';

describe('PrintPreviewModal pure CSS scoping, orientation & native share helpers', () => {
  it('enables Share .HTM whenever running inside native Android/iOS wrapper even without navigator.share', () => {
    expect(canShareHtmlDocument('pedigree.htm', true)).toBe(true);
  });

  it('scopes html and body selectors cleanly to #barn-print-stage', () => {
    expect(scopePrintSelectorList('html, body, .card, body .header')).toBe(
      '#barn-print-stage, #barn-print-stage, #barn-print-stage .card, #barn-print-stage .header'
    );
  });

  it('extracts @page and @media print rules while dropping @media screen rules', () => {
    const css = `
      @page { size: letter landscape; margin: 0.35in; }
      body { font-family: Georgia, serif; }
      @media print {
        .page-break { break-after: page; page-break-after: always; }
        html { background: #fff; }
      }
      @media screen {
        .toolbar-only { display: block; }
      }
    `;
    const extracted = extractScopedPrintCssFromRawCss(css);
    expect(extracted.pageRules).toEqual(['@page { size: letter landscape; margin: 0.35in; }']);
    const joined = extracted.scopedRules.join('\n');
    expect(joined).toContain('.page-break { break-after: page; page-break-after: always; }');
    expect(joined).toContain('#barn-print-stage { font-family: Georgia, serif; }');
    expect(joined).not.toContain('.toolbar-only');
  });

  it('detects landscape vs portrait orientation from @page rules and document markup', () => {
    expect(
      detectDocumentPrintOrientation(
        ['@page { size: letter landscape; margin: 0.3in; }'],
        '<html><body></body></html>'
      )
    ).toBe('landscape');
    expect(
      detectDocumentPrintOrientation(
        ['@page { size: letter portrait; margin: 0.5in; }'],
        '<html><body></body></html>'
      )
    ).toBe('portrait');
  });
});
