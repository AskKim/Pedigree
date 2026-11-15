import { describe, expect, it } from 'vitest';
import {
  buildCompleteBackupZipArchive,
  parseBackupArchiveInput,
} from '../backupArchive';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  applyMemoFormatAction,
  parseMemoBlocks,
  sanitizeSpeciesMemo,
  toggleMemoChecklistLine,
} from '../speciesMemo';
import {
  exportBarnBackupJson,
  exportSpeciesBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';

describe('speciesMemo — data hygiene, emoji preservation, and safe formatting', () => {
  it('preserves keyboard emoji, ZWJ sequences, variation selectors, and skin tones intact', () => {
    const keyboardInput =
      'Rabbit herd 🐇 check ❤️ feed 🌾 weight ⚖️\r\nFarmer 🧑🏽‍🌾 flag 🇺🇸 list 1️⃣';
    const clean = sanitizeSpeciesMemo(keyboardInput);
    expect(clean).toBe(
      'Rabbit herd 🐇 check ❤️ feed 🌾 weight ⚖️\nFarmer 🧑🏽‍🌾 flag 🇺🇸 list 1️⃣'
    );
  });

  it('rejects non-string erroneous entries and strips control chars, bidi overrides, and lone surrogates', () => {
    expect(sanitizeSpeciesMemo(null)).toBe('');
    expect(sanitizeSpeciesMemo(undefined)).toBe('');
    expect(sanitizeSpeciesMemo(12345)).toBe('');
    expect(sanitizeSpeciesMemo({ injected: true })).toBe('');
    expect(sanitizeSpeciesMemo(['a', 'b'])).toBe('');

    // Strip NUL, C0/C1 control chars, bidi overrides (\u202E), and broken lone high/low surrogates
    const dirty =
      'Safe\u0000Text\u0007 \u202Eoverride\u2069 \uD83Dbroken\uDC07 valid🐇\tindented';
    expect(sanitizeSpeciesMemo(dirty)).toBe('SafeText override broken valid🐇\tindented');

    // Truncating at a max limit never splits a surrogate pair
    const emojis = '🐇🐐🐑'; // 6 UTF-16 code units
    expect(sanitizeSpeciesMemo(emojis, 3)).toBe('🐇'); // steps back from split 🐐 high surrogate
    expect(sanitizeSpeciesMemo(emojis, 4)).toBe('🐇🐐');
  });

  it('applies basic formatting bar actions and checklist toggling cleanly', () => {
    const step1 = applyMemoFormatAction('Check buck weight', 6, 10, { type: 'bold' });
    expect(step1.nextText).toBe('Check **buck** weight');

    const step2 = applyMemoFormatAction('Morning Feed', 0, 0, { type: 'heading' });
    expect(step2.nextText).toBe('## Morning Feed');

    const step3 = applyMemoFormatAction('Trim nails', 0, 0, { type: 'checklist' });
    expect(step3.nextText).toBe('- [ ] Trim nails');
    expect(toggleMemoChecklistLine(step3.nextText, 0)).toBe('- [x] Trim nails');
    expect(toggleMemoChecklistLine('- [x] Trim nails', 0)).toBe('- [ ] Trim nails');

    const step4 = applyMemoFormatAction('Hay ', 4, 4, { type: 'emoji', emoji: '🌾' });
    expect(step4.nextText).toBe('Hay 🌾');

    const step5 = applyMemoFormatAction('', 0, 0, { type: 'date', dateLabel: 'Nov 15, 2026' });
    expect(step5.nextText).toBe('[Nov 15, 2026] ');
  });

  it('parses scripts/HTML strings strictly as plain text tokens without code execution', () => {
    const payload = [
      '## Herd Notes 🐇',
      '**Important** <script>alert("xss")</script>',
      '- *Check* <img src=x onerror=alert(1)>',
      '- [ ] [link](javascript:alert(1))',
      "- [x] '; DROP TABLE animals; --",
    ].join('\n');

    const blocks = parseMemoBlocks(payload);
    expect(blocks).toHaveLength(5);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      lineIndex: 1,
      tokens: [
        { type: 'bold', text: 'Important' },
        { type: 'text', text: ' <script>alert("xss")</script>' },
      ],
    });
    expect(blocks[3]).toEqual({
      type: 'checklist',
      lineIndex: 3,
      checked: false,
      tokens: [{ type: 'text', text: '[link](javascript:alert(1))' }],
    });
    expect(blocks[4]).toEqual({
      type: 'checklist',
      lineIndex: 4,
      checked: true,
      tokens: [{ type: 'text', text: "'; DROP TABLE animals; --" }],
    });
  });

  it('persists and sanitizes per-species memos cleanly across JSON backup export and import', () => {
    const snap = buildFullPredefinedSampleSnapshot();
    const rabbit = snap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    rabbit.memoText = '## Copper Creek Notes 🐇\n- [ ] Weigh kits ✅';
    rabbit.memoUpdatedAt = '2026-11-15T18:00:00.000Z';

    const exported = exportBarnBackupJson(snap);
    const parsedObj = JSON.parse(exported);
    // Inject an erroneous non-string memoText into Goat in backup JSON to test hygiene on restore
    const goatRow = parsedObj.speciesProfiles.find((s: { name: string }) => s.name === 'Goat');
    goatRow.memoText = { badPayload: 42 };

    const restored = parseBarnBackupJson(JSON.stringify(parsedObj), snap.settings);
    const restoredRabbit = restored.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    const restoredGoat = restored.speciesProfiles.find((s) => s.name === 'Goat')!;

    expect(restoredRabbit.memoText).toBe('## Copper Creek Notes 🐇\n- [ ] Weigh kits ✅');
    expect(restoredRabbit.memoUpdatedAt).toBe('2026-11-15T18:00:00.000Z');
    expect(restoredGoat.memoText).toBe('');
  });

  it('includes and restores per-species memos in Complete .ZIP archives, single-species backups, and snapshot merges', () => {
    const snap = buildFullPredefinedSampleSnapshot();
    const rabbit = snap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    const goat = snap.speciesProfiles.find((s) => s.name === 'Goat')!;
    rabbit.memoText = '## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps';
    rabbit.memoUpdatedAt = '2026-11-15T19:00:00.000Z';
    goat.memoText = 'Hoof trim notes 🐐';
    goat.memoUpdatedAt = '2026-11-15T18:30:00.000Z';

    // 1. Complete .ZIP backup + restore
    const zipArchive = buildCompleteBackupZipArchive(snap);
    const parsedZip = parseBackupArchiveInput(zipArchive.bytes, 'backup.zip', snap.settings);
    expect(parsedZip.kind).toBe('full_snapshot');
    if (parsedZip.kind === 'full_snapshot') {
      const zipRabbit = parsedZip.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit')!;
      const zipGoat = parsedZip.snapshot.speciesProfiles.find((s) => s.name === 'Goat')!;
      expect(zipRabbit.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');
      expect(zipRabbit.memoUpdatedAt).toBe('2026-11-15T19:00:00.000Z');
      expect(zipGoat.memoText).toBe('Hoof trim notes 🐐');
    }

    // 2. Targeted single-species backup + restore
    const rabbitOnlyJson = exportSpeciesBackupJson(snap, 'Rabbit');
    const restoredSpeciesSnap = parseBarnBackupJson(rabbitOnlyJson, snap.settings);
    const restoredRabbitOnly = restoredSpeciesSnap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    expect(restoredRabbitOnly.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');

    // 3. Merging a peer snapshot whose species gestation changed later does not clobber newer memo
    const peerSnap = buildFullPredefinedSampleSnapshot();
    const peerRabbit = peerSnap.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    peerRabbit.gestationDays = 32;
    peerRabbit.memoText = '';
    peerRabbit.memoUpdatedAt = '';
    peerRabbit.updatedAt = '2099-01-01T00:00:00.000Z';

    const merged = mergeBarnSnapshots(snap, peerSnap);
    const mergedRabbit = merged.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit')!;
    expect(mergedRabbit.gestationDays).toBe(32);
    expect(mergedRabbit.memoText).toBe('## Winter Feed Mix 🐇🌾\n- [x] Double check heat lamps');
    expect(mergedRabbit.memoUpdatedAt).toBe('2026-11-15T19:00:00.000Z');
  });
});
