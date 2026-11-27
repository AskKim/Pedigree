/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPromptsCatalogManifest,
  isValidPromptsManifest,
  parsePromptEntry,
  partitionPromptsByStatus,
  PROMPTS_FILE_STRUCTURE_BREADCRUMB,
  PROMPTS_FOLDER_PATH,
  PROMPTS_MOVED_DOCUMENTATION_NOTE,
} from '../promptsCatalog';

describe('promptsCatalog — /prompts/ inventory, protection flags & active/archived split', () => {
  it('verifies all seven repository prompts live in root /prompts/ with DO_NOT_REMOVE_WITHOUT_CONFIRMATION', () => {
    const promptsDir = path.resolve(process.cwd(), 'prompts');
    const filenames = fs
      .readdirSync(promptsDir)
            .filter((name) => {
        if (name.startsWith('.')) return false;
        const fullPath = path.join(promptsDir, name);
        try {
          return fs.lstatSync(fullPath).isFile();
        } catch {
          return false;
        }
      })
      .sort();

    expect(filenames).toEqual([
      'fix_error_log_prompt.md',
      'master_system_prompt.md',
      'master_system_prompt_old_v1.md',
      'master_system_prompt_old_v2.md',
      'master_system_prompt_old_v4.md',
      'resume_backlog_plan_prompt.md',
      'start_new_backlog_prompt.md',
    ]);

    const filesByPath: Record<string, string> = {};
    for (const name of filenames) {
      filesByPath[`/prompts/${name}`] = fs.readFileSync(path.join(promptsDir, name), 'utf8');
    }

    const manifest = buildPromptsCatalogManifest(filesByPath, '2026-11-18T10:00:00.000Z');
    expect(manifest.folderPath).toBe('/prompts');
    expect(manifest.entries).toHaveLength(7);
    expect(isValidPromptsManifest(manifest)).toBe(true);

    for (const entry of manifest.entries) {
      expect(entry.protectedDoNotRemove).toBe(true);
      expect(entry.protectionFlag).toBe('DO_NOT_REMOVE_WITHOUT_CONFIRMATION');
      expect(entry.relativePath).toBe(`prompts/${entry.filename}`);
      expect(entry.summary.length).toBeGreaterThan(20);
    }

    const { active, archived } = partitionPromptsByStatus(manifest.entries);
    expect(active.map((e) => e.filename)).toEqual([
      'master_system_prompt.md',
      'start_new_backlog_prompt.md',
      'resume_backlog_plan_prompt.md',
      'fix_error_log_prompt.md',
    ]);
    expect(archived.map((e) => e.filename)).toEqual([
      'master_system_prompt_old_v4.md',
      'master_system_prompt_old_v2.md',
      'master_system_prompt_old_v1.md',
    ]);
  });

  it('parses newly added custom prompts or scripts dynamically and detects missing lock flags', () => {
    const customActive = parsePromptEntry(
      '/prompts/release_audit_script.md',
      `# Release Audit Checklist\n\nVerify offline SQLite backups and bundle budgets before tagging.\n`
    );
    expect(customActive.status).toBe('active');
    expect(customActive.title).toBe('Release Audit Checklist');
    expect(customActive.protectedDoNotRemove).toBe(false);
    expect(customActive.protectionFlag).toBeNull();
    expect(customActive.summary).toContain('Verify offline SQLite backups');

    const customArchived = parsePromptEntry(
      'prompts/legacy_migration_old_v0.md',
      `<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->\n# Legacy Migration\n\nOld script.\n`
    );
    expect(customArchived.status).toBe('archived');
    expect(customArchived.protectedDoNotRemove).toBe(true);
  });

  it('exposes root folder breadcrumb constants and relocation documentation note', () => {
    expect(PROMPTS_FOLDER_PATH).toBe('/prompts');
    expect(PROMPTS_FILE_STRUCTURE_BREADCRUMB).toEqual(['Pedigree (Repo Root)', 'prompts']);
    expect(PROMPTS_MOVED_DOCUMENTATION_NOTE).toContain('/prompts/');
    expect(PROMPTS_MOVED_DOCUMENTATION_NOTE).toContain('PromptsDirectoryScreen.tsx');
  });

  it('rejects malformed prompts-manifest payloads cleanly', () => {
    expect(isValidPromptsManifest(null)).toBe(false);
    expect(isValidPromptsManifest({})).toBe(false);
    expect(
      isValidPromptsManifest({
        folderPath: '/prompts',
        scannedAtIso: '2026-11-18T00:00:00.000Z',
        entries: [{ filename: 'broken.md' }],
      })
    ).toBe(false);
  });
});
