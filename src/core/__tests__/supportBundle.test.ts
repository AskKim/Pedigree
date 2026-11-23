import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  buildErrorLogsJson,
  buildSupportBundleZipArchive,
  buildSupportMailtoHref,
  DiagnosticLogEntry,
  DiagnosticSummary,
  formatSupportReportText,
} from '../supportBundle';

function collectCoreTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...collectCoreTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('src/core/ isolation & supportBundle', () => {
  it('enforces zero upward imports from src/core/ into storage/, hooks/, components/, or utils/', () => {
    const coreDir = resolve(process.cwd(), 'src/core');
    const files = collectCoreTsFiles(coreDir);
    expect(files.length).toBeGreaterThan(10);

    const forbiddenImportPattern =
      /(?:from|import)\s+['"][^'"]*(?:\/storage\/|\/hooks\/|\/components\/|\/utils\/)['"]/g;
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(forbiddenImportPattern);
      if (matches && matches.length > 0) {
        violations.push(`${file}: ${matches.join(', ')}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('builds diagnostic text report, JSON log payload, mailto link, and ZIP archive purely in core', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const summary: DiagnosticSummary = {
      totalEntries: 1,
      errorCount: 1,
      memoryWarningCount: 0,
      crashCount: 0,
      oldestEntryIso: '2026-11-18T12:00:00.000Z',
      newestEntryIso: '2026-11-18T12:00:00.000Z',
      currentMemory: {
        usedHeapBytes: 12 * 1024 * 1024,
        totalHeapBytes: 24 * 1024 * 1024,
        heapLimitBytes: 1024 * 1024 * 1024,
        heapPercent: 1.2,
        deviceMemoryGb: 8,
      },
      config: {
        verboseEnabled: true,
        retentionDays: 7,
        supportEmail: '',
      },
      sessionId: 'sess-test',
      userAgent: 'Vitest',
      platformInfo: '1280x800 @1x · 8 cores',
    };
    const entries: DiagnosticLogEntry[] = [
      {
        id: 'log-1',
        timestampIso: '2026-11-18T12:00:00.000Z',
        timestampMs: 1795003200000,
        sessionId: 'sess-test',
        level: 'error',
        category: 'storage',
        route: 'settings',
        message: 'Sample diagnostic event',
      },
    ];

    const reportText = formatSupportReportText(entries, summary, snapshot);
    expect(reportText).toContain('Sample diagnostic event');
    expect(reportText).toContain('Errors/Fatal: 1');

    const logsJson = JSON.parse(buildErrorLogsJson(entries, summary, snapshot)) as {
      format: string;
      entries: DiagnosticLogEntry[];
    };
    expect(logsJson.format).toBe('community-pedigree-diagnostics-v1');
    expect(logsJson.entries).toHaveLength(1);

    const zipResult = buildSupportBundleZipArchive({
      entries,
      summary,
      snapshot,
      includeData: true,
      includePhotos: false,
    });
    expect(zipResult.bytes.byteLength).toBeGreaterThan(100);
    expect(zipResult.includedData).toBe(true);
    expect(zipResult.includedPhotos).toBe(false);

    const mailto = buildSupportMailtoHref({
      recipientEmail: 'support@example.com',
      filename: zipResult.filename,
      summary,
      includedData: true,
      includedPhotos: false,
    });
    expect(mailto).toContain('mailto:support%40example.com');
  });
});
