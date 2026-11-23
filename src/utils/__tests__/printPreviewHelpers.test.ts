import { describe, expect, it } from 'vitest';
import {
  canShareHtmlDocument,
  detectDocumentPrintOrientation,
  extractScopedPrintCssFromRawCss,
  sanitizePrintStageHtml,
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

  it('sanitizes executable tags, inline event handlers, and dangerous URLs from #barn-print-stage HTML while keeping raster photos', () => {
    const dirty = `
      <div class="pedigree-card" onclick="alert(1)">
        <h1>Buck #42</h1>
        <img src="data:image/png;base64,iVBORw0KGgo=" onerror="fetch('https://evil.example')" alt="Buck" />
        <a href="javascript:alert(2)">Bad Link</a>
        <a href="data:text/html,<script>alert(3)</script>">Bad Data Link</a>
        <script>window.__xss = true;</script>
        <iframe src="https://evil.example"></iframe>
        <object data="x.swf"></object>
        <embed src="x.swf" />
      </div>
    `;
    const cleaned = sanitizePrintStageHtml(dirty);
    expect(cleaned).toContain('<h1>Buck #42</h1>');
    expect(cleaned).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(cleaned).not.toMatch(/<script/i);
    expect(cleaned).not.toMatch(/<iframe/i);
    expect(cleaned).not.toMatch(/<object/i);
    expect(cleaned).not.toMatch(/<embed/i);
    expect(cleaned).not.toMatch(/\bonclick\s*=/i);
    expect(cleaned).not.toMatch(/\bonerror\s*=/i);
    expect(cleaned).not.toMatch(/javascript:/i);
    expect(cleaned).not.toMatch(/data:text\/html/i);
  });
});
