/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Memo Pad Hygiene & Formatting Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Security & Hygiene Guarantees:
 * - Preserves all valid Unicode characters including keyboard/OS emoji, ZWJ sequences,
 *   variation selectors, skin-tone modifiers, and regional flags.
 * - Rejects non-string/erroneous payloads cleanly, strips NUL/C0/C1 control characters
 *   and bidirectional spoofing overrides, repairs lone UTF-16 surrogates, and bounds length
 *   safely without splitting emoji surrogate pairs.
 * - Parses only a minimal plain-text formatting AST (headings, bullets, checklists, **bold**,
 *   *italic*) with ZERO HTML parsing, ZERO link evaluation, and ZERO code execution.
 */

export const MAX_SPECIES_MEMO_CHARS = 50_000;

export interface MemoEmojiItem {
  emoji: string;
  label: string;
}

export const MEMO_EMOJI_PALETTE: MemoEmojiItem[] = [
  { emoji: '🐇', label: 'Rabbit' },
  { emoji: '🐐', label: 'Goat' },
  { emoji: '🐑', label: 'Sheep' },
  { emoji: '🐖', label: 'Pig' },
  { emoji: '🐄', label: 'Cattle' },
  { emoji: '🐾', label: 'Livestock' },
  { emoji: '🌾', label: 'Feed / Hay' },
  { emoji: '🏡', label: 'Barn' },
  { emoji: '🩺', label: 'Health Check' },
  { emoji: '💉', label: 'Care / Meds' },
  { emoji: '⚖️', label: 'Weight' },
  { emoji: '📋', label: 'Notes' },
  { emoji: '✅', label: 'Done' },
  { emoji: '⚠️', label: 'Attention' },
  { emoji: '❤️', label: 'Favorite' },
  { emoji: '⭐', label: 'Star' },
];

/**
 * Strips unpaired UTF-16 surrogates while preserving every valid supplementary-plane emoji pair.
 */
function stripLoneSurrogates(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      // Drop unpaired high surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Drop unpaired low surrogate
    } else {
      out += input[i];
    }
  }
  return out;
}

/**
 * Truncates `text` to `maxChars` without slicing inside a UTF-16 surrogate pair.
 */
function truncateSafelyAtSurrogateBoundary(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  let cut = maxChars;
  const lastCode = text.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut -= 1;
  }
  return text.slice(0, cut);
}

/**
 * Sanitizes memo text from live keyboard/paste input or imported/corrupted storage values.
 *
 * - Coerces erroneous non-string values (`null`, numbers, objects, arrays) to `""`.
 * - Normalizes CRLF/CR newlines to `\n`.
 * - Strips NUL bytes, non-printable C0/C1 control characters (keeping `\n` and `\t`),
 *   and bidirectional text override spoofing characters.
 * - Drops broken lone UTF-16 surrogates while keeping all valid emoji, ZWJ (`\u200D`),
 *   variation selectors (`\uFE0F`), and Unicode text intact.
 */
export function sanitizeSpeciesMemo(
  raw: unknown,
  maxChars: number = MAX_SPECIES_MEMO_CHARS
): string {
  if (typeof raw !== 'string') return '';

  const normalizedNewlines = raw.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  const withoutControls = normalizedNewlines.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '');
  const validUnicode = stripLoneSurrogates(withoutControls);
  return truncateSafelyAtSurrogateBoundary(validUnicode, maxChars);
}

export type MemoFormatAction =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'heading' }
  | { type: 'bullet' }
  | { type: 'checklist' }
  | { type: 'date'; dateLabel: string }
  | { type: 'emoji'; emoji: string };

export interface MemoFormatResult {
  nextText: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

function clampSelectionIndex(text: string, idx: number): number {
  const safe = Number.isFinite(idx) ? Math.max(0, Math.min(text.length, Math.round(idx))) : 0;
  // Never place cursor in the middle of a surrogate pair
  if (safe > 0 && safe < text.length) {
    const prev = text.charCodeAt(safe - 1);
    const curr = text.charCodeAt(safe);
    if (prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff) {
      return safe + 1;
    }
  }
  return safe;
}

function applyLinePrefixToggle(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string
): MemoFormatResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
  const lineEndIdx = text.indexOf('\n', selEnd);
  const blockEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const block = text.slice(lineStart, blockEnd);
  const lines = block.split('\n');

  const allHavePrefix = lines.every((l) => l.startsWith(prefix));
  const transformed = lines.map((line) => {
    if (allHavePrefix) {
      return line.slice(prefix.length);
    }
    // Replace competing line prefixes cleanly
    const stripped = line.replace(/^(?:##\s+|- \[[ xX]\]\s+|- )/, '');
    return `${prefix}${stripped}`;
  });

  const nextBlock = transformed.join('\n');
  const nextText = sanitizeSpeciesMemo(
    text.slice(0, lineStart) + nextBlock + text.slice(blockEnd)
  );
  const cursorPos = Math.min(nextText.length, lineStart + nextBlock.length);
  return {
    nextText,
    nextSelectionStart: cursorPos,
    nextSelectionEnd: cursorPos,
  };
}

/**
 * Applies a basic safe formatting action or emoji insertion to the memo scratchpad.
 */
export function applyMemoFormatAction(
  rawText: string,
  rawSelStart: number,
  rawSelEnd: number,
  action: MemoFormatAction
): MemoFormatResult {
  const text = sanitizeSpeciesMemo(rawText);
  const start = clampSelectionIndex(text, Math.min(rawSelStart, rawSelEnd));
  const end = clampSelectionIndex(text, Math.max(rawSelStart, rawSelEnd));
  const selected = text.slice(start, end);

  if (action.type === 'bold' || action.type === 'italic') {
    const marker = action.type === 'bold' ? '**' : '*';
    const placeholder = action.type === 'bold' ? 'bold text' : 'italic text';
    const inner = selected || placeholder;
    const inserted = `${marker}${inner}${marker}`;
    const candidate = text.slice(0, start) + inserted + text.slice(end);
    const nextText = sanitizeSpeciesMemo(candidate);
    if (selected) {
      const nextPos = Math.min(nextText.length, start + inserted.length);
      return {
        nextText,
        nextSelectionStart: nextPos,
        nextSelectionEnd: nextPos,
      };
    }
    const innerStart = Math.min(nextText.length, start + marker.length);
    const innerEnd = Math.min(nextText.length, innerStart + placeholder.length);
    return {
      nextText,
      nextSelectionStart: innerStart,
      nextSelectionEnd: innerEnd,
    };
  }

  if (action.type === 'heading') {
    return applyLinePrefixToggle(text, start, end, '## ');
  }
  if (action.type === 'bullet') {
    return applyLinePrefixToggle(text, start, end, '- ');
  }
  if (action.type === 'checklist') {
    return applyLinePrefixToggle(text, start, end, '- [ ] ');
  }

  const snippet =
    action.type === 'emoji'
      ? sanitizeSpeciesMemo(action.emoji)
      : sanitizeSpeciesMemo(`[${action.dateLabel}] `);
  const candidate = text.slice(0, start) + snippet + text.slice(end);
  const nextText = sanitizeSpeciesMemo(candidate);
  const nextPos = Math.min(nextText.length, start + snippet.length);
  return {
    nextText,
    nextSelectionStart: nextPos,
    nextSelectionEnd: nextPos,
  };
}

/**
 * Toggles a checklist item on `lineIndex` between `- [ ] ` and `- [x] `.
 */
export function toggleMemoChecklistLine(rawText: string, lineIndex: number): string {
  const text = sanitizeSpeciesMemo(rawText);
  const lines = text.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  const line = lines[lineIndex];
  if (/^- \[ \]\s*/.test(line)) {
    lines[lineIndex] = line.replace(/^- \[ \]/, '- [x]');
  } else if (/^- \[[xX]\]\s*/.test(line)) {
    lines[lineIndex] = line.replace(/^- \[[xX]\]/, '- [ ]');
  }
  return sanitizeSpeciesMemo(lines.join('\n'));
}

export type MemoInlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string };

/**
 * Parses inline `**bold**` and `*italic*` runs purely into plain-text tokens (never HTML).
 */
export function parseMemoInlineTokens(line: string): MemoInlineToken[] {
  const tokens: MemoInlineToken[] = [];
  const pattern = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'text', text: line.slice(lastIdx, match.index) });
    }
    const rawToken = match[0];
    if (rawToken.startsWith('**') && rawToken.endsWith('**') && rawToken.length > 4) {
      tokens.push({ type: 'bold', text: rawToken.slice(2, -2) });
    } else if (rawToken.startsWith('*') && rawToken.endsWith('*') && rawToken.length > 2) {
      tokens.push({ type: 'italic', text: rawToken.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', text: rawToken });
    }
    lastIdx = pattern.lastIndex;
  }

  if (lastIdx < line.length) {
    tokens.push({ type: 'text', text: line.slice(lastIdx) });
  }
  return tokens.length > 0 ? tokens : [{ type: 'text', text: '' }];
}

export type MemoLineBlock =
  | { type: 'blank'; lineIndex: number }
  | { type: 'heading'; lineIndex: number; tokens: MemoInlineToken[] }
  | { type: 'checklist'; lineIndex: number; checked: boolean; tokens: MemoInlineToken[] }
  | { type: 'bullet'; lineIndex: number; tokens: MemoInlineToken[] }
  | { type: 'paragraph'; lineIndex: number; tokens: MemoInlineToken[] };

/**
 * Parses sanitized memo text into safe structural blocks for non-HTML React rendering.
 */
export function parseMemoBlocks(rawText: string): MemoLineBlock[] {
  const clean = sanitizeSpeciesMemo(rawText);
  if (!clean) return [];
  const lines = clean.split('\n');
  return lines.map((line, lineIndex): MemoLineBlock => {
    if (!line.trim()) {
      return { type: 'blank', lineIndex };
    }
    if (line.startsWith('## ')) {
      return {
        type: 'heading',
        lineIndex,
        tokens: parseMemoInlineTokens(line.slice(3)),
      };
    }
    const checkMatch = /^- \[([ xX])\]\s?(.*)$/.exec(line);
    if (checkMatch) {
      return {
        type: 'checklist',
        lineIndex,
        checked: checkMatch[1].toLowerCase() === 'x',
        tokens: parseMemoInlineTokens(checkMatch[2]),
      };
    }
    if (line.startsWith('- ')) {
      return {
        type: 'bullet',
        lineIndex,
        tokens: parseMemoInlineTokens(line.slice(2)),
      };
    }
    return {
      type: 'paragraph',
      lineIndex,
      tokens: parseMemoInlineTokens(line),
    };
  });
}
