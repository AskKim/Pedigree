import { describe, expect, it } from 'vitest';
import {
  ALPHA_2_FINAL_IMP_ID,
  ALPHA_2_RELEASE,
  ALPHA_3_RELEASE,
  buildImprovementsRecoveryJson,
  evaluateImprovementInvariants,
  formatImprovementsMarkdown,
  getImprovementRelease,
  getImprovementsByRelease,
  IMPROVEMENTS_REGISTRY,
  isAlpha2Improvement,
  isAlpha3Improvement,
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
    expect(md).toContain('IMP-038');
    expect(md).toContain('IMP-039');
    expect(md).toContain('IMP-040');
    expect(md).toContain('IMP-041');
    expect(md).toContain('IMP-042');
    expect(md).toContain('IMP-043');
    expect(md).toContain('IMP-044');
    expect(md).toContain('IMP-045');
    expect(md).toContain('IMP-046');
    expect(md).toContain('IMP-047');
    expect(md).toContain('IMP-048');
    expect(md).toContain('IMP-049');
    expect(md).toContain('IMP-050');
    expect(md).toContain('IMP-051');
    expect(md).toContain('IMP-052');
    expect(md).toContain('IMP-053');
    expect(md).toContain('IMP-054');
    expect(md).toContain('IMP-055');
    expect(md).toContain('IMP-056');
    expect(md).toContain('IMP-057');
    expect(md).toContain('IMP-058');
    expect(md).toContain('IMP-059');
    expect(md).toContain('IMP-060');
    expect(md).toContain('IMP-061');

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
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-038')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-039')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-040')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-041')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-042')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-043')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-044')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-045')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-046')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-047')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-048')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-049')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-050')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-051')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-052')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-053')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-054')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-055')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-056')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-057')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-058')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-059')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-060')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-061')).toBe(true);
  });

  it('correctly identifies all current improvements (IMP-001 to IMP-064) as Alpha 2 and subsequent improvements as Alpha 3', () => {
    expect(ALPHA_2_FINAL_IMP_ID).toBe('IMP-064');
    expect(ALPHA_2_RELEASE).toBe('alpha-2');
    expect(ALPHA_3_RELEASE).toBe('alpha-3');

    // All currently registered improvements must be Alpha 2
    for (const entry of IMPROVEMENTS_REGISTRY) {
      expect(isAlpha2Improvement(entry)).toBe(true);
      expect(isAlpha3Improvement(entry)).toBe(false);
      expect(getImprovementRelease(entry)).toBe('alpha-2');
    }

    const alpha2List = getImprovementsByRelease('alpha-2');
    expect(alpha2List.length).toBe(IMPROVEMENTS_REGISTRY.length);
    expect(alpha2List.length).toBe(64);

    const alpha3List = getImprovementsByRelease('alpha-3');
    expect(alpha3List.length).toBe(0);

    // Any improvement starting at IMP-065 or higher defaults to Alpha 3
    const nextEntry = { id: 'IMP-065', title: 'Next improvement', summary: 'Future feature' };
    expect(isAlpha2Improvement(nextEntry)).toBe(false);
    expect(isAlpha3Improvement(nextEntry)).toBe(true);
    expect(getImprovementRelease(nextEntry)).toBe('alpha-3');

    // Explicit release property is honored
    expect(getImprovementRelease({ id: 'IMP-010', release: 'alpha-3' })).toBe('alpha-3');
    expect(getImprovementRelease({ id: 'IMP-099', release: 'alpha-2' })).toBe('alpha-2');

    // Recovery bundle JSON reflects Alpha 2 and Alpha 3 counts
    const json = JSON.parse(buildImprovementsRecoveryJson());
    expect(json.alpha2Total).toBe(64);
    expect(json.alpha3Total).toBe(0);
    expect(json.entries.every((e: { release: string }) => e.release === 'alpha-2')).toBe(true);

    // Markdown documentation reflects classification header
    const md = formatImprovementsMarkdown();
    expect(md).toContain('## Release Milestone Classification');
    expect(md).toContain('- **Alpha 2 (v0.1.0-alpha.2 — Released Baseline):** `IMP-001` through `IMP-064` (64 improvements).');
    expect(md).toContain('- **Alpha 3 (v0.1.0-alpha.3 — Active Deliverables):** `IMP-065` onwards (0 improvements).');
    expect(md).toContain('- **Release Milestone:** Alpha 2 (`alpha-2`)');
  });
});
