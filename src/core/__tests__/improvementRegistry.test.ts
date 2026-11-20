import { describe, expect, it } from 'vitest';
import {
  buildImprovementsRecoveryJson,
  evaluateImprovementInvariants,
  formatImprovementsMarkdown,
  IMPROVEMENTS_REGISTRY,
} from '../improvementRegistry';

describe('improvementRegistry — anti-wipeout tracking & drift verification', () => {
  it('defines unique IDs, non-empty tracked files, invariants, and restoration playbooks for every entry', () => {
    const ids = new Set<string>();
    for (const entry of IMPROVEMENTS_REGISTRY) {
      expect(entry.id).toMatch(/^IMP-\d{3}$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);

      expect(entry.title.trim().length).toBeGreaterThan(5);
      expect(entry.files.length).toBeGreaterThan(0);
      expect(entry.invariants.length).toBeGreaterThan(0);
      expect(entry.restorePlaybook.length).toBeGreaterThan(0);
      for (const inv of entry.invariants) {
        expect(inv.requiredSubstrings.length).toBeGreaterThan(0);
      }
    }
  });

  it('passes when all required tokens are present and flags missing or forbidden drift accurately', () => {
    const mockDisk: Record<string, string> = {};
    for (const entry of IMPROVEMENTS_REGISTRY) {
      for (const inv of entry.invariants) {
        mockDisk[inv.filePath] = [
          mockDisk[inv.filePath] ?? '',
          ...inv.requiredSubstrings,
        ].join('\n');
      }
    }

    const cleanReport = evaluateImprovementInvariants(mockDisk);
    expect(cleanReport.ok).toBe(true);
    expect(cleanReport.violations).toHaveLength(0);
    expect(cleanReport.passedCount).toBe(IMPROVEMENTS_REGISTRY.length);

    // Simulate a GitHub overwrite wiping a critical helper in syncAndExports.ts and re-enabling devOptions SW
    const driftedDisk: Record<string, string> = {
      ...mockDisk,
      'src/core/syncAndExports.ts': 'export function exportBarnBackupJson() {}',
      'vite.config.ts': `${mockDisk['vite.config.ts']}\ndevOptions: {\n      enabled: true`,
    };

    const driftedReport = evaluateImprovementInvariants(driftedDisk);
    expect(driftedReport.ok).toBe(false);
    expect(driftedReport.violations.some((v) => v.entryId === 'IMP-001')).toBe(true);
    expect(driftedReport.violations.some((v) => v.entryId === 'IMP-007')).toBe(true);
    expect(
      driftedReport.violations.some((v) => v.issue.includes('Detected regression pattern'))
    ).toBe(true);
  });

  it('generates readable Markdown documentation and valid JSON recovery bundles', () => {
    const md = formatImprovementsMarkdown();
    expect(md).toContain('# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log');
    expect(md).toContain('npm run verify:improvements');
    expect(md).toContain('IMP-001');
    expect(md).toContain('IMP-011');
    expect(md).toContain('IMP-014');
    expect(md).toContain('IMP-015');
    expect(md).toContain('IMP-016');
    expect(md).toContain('IMP-017');
    expect(md).toContain('IMP-021');
    expect(md).toContain('IMP-022');
    expect(md).toContain('IMP-023');
    expect(md).toContain('IMP-029');
    expect(md).toContain('IMP-030');
    expect(md).toContain('IMP-031');
    expect(md).toContain('IMP-032');
    expect(md).toContain('IMP-034');
    expect(md).toContain('IMP-035');
    expect(md).toContain('IMP-036');
    expect(md).toContain('IMP-037');

    const jsonText = buildImprovementsRecoveryJson();
    const parsed = JSON.parse(jsonText);
    expect(parsed.format).toBe('community-pedigree-improvements-log');
    expect(parsed.totalEntries).toBe(IMPROVEMENTS_REGISTRY.length);
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-017')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-021')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-022')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-023')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-029')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-030')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-031')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-032')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-034')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-035')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-036')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-037')).toBe(true);
  });
});
