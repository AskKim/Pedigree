/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PWA Wrapper — AI Studio Companion Documentation Server
 * Serves `/api/docs/*` (safe Markdown CRUD inside `/docs`), optional `/api/ai/generate`
 * (server-side Gemini helper), and Vite dev middleware on port 3000.
 * Not included in the Android APK (`android-wrapper/`).
 */
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, 'docs');

const MAX_PROMPT_CHARS = 4000;
const MAX_CONTEXT_CHARS = 24000;
const MAX_AI_CACHE_ENTRIES = 32;
const AI_CACHE_TTL_MS = 10 * 60 * 1000;
const HEADER_PEEK_BYTES = 512;

interface AiCacheEntry {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  expiresAt: number;
}

const aiResponseCache = new Map<string, AiCacheEntry>();
const inFlightAiRequests = new Map<string, Promise<AiCacheEntry>>();

function resolveSafeDocPath(rawFilename: string): { filename: string; filePath: string } | null {
  const cleaned = path.basename(String(rawFilename ?? '').trim());
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned.includes('\0')) {
    return null;
  }
  const normalized = cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`;
  const resolved = path.resolve(DOCS_DIR, normalized);
  if (!resolved.startsWith(`${DOCS_DIR}${path.sep}`)) {
    return null;
  }
  return { filename: normalized, filePath: resolved };
}

async function readDocHeadingOnly(filePath: string, fallbackName: string): Promise<string> {
  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(filePath, 'r');
    const buf = Buffer.allocUnsafe(HEADER_PEEK_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEADER_PEEK_BYTES, 0);
    const snippet = buf.subarray(0, bytesRead).toString('utf8');
    const match = snippet.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : fallbackName;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function compactMarkdownInput(raw: string, maxChars: number): string {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}

function getCachedAiEntry(key: string): AiCacheEntry | null {
  const entry = aiResponseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    aiResponseCache.delete(key);
    return null;
  }
  // Refresh LRU order
  aiResponseCache.delete(key);
  aiResponseCache.set(key, entry);
  return entry;
}

function setCachedAiEntry(key: string, entry: AiCacheEntry): void {
  if (aiResponseCache.has(key)) {
    aiResponseCache.delete(key);
  } else if (aiResponseCache.size >= MAX_AI_CACHE_ENTRIES) {
    const oldestKey = aiResponseCache.keys().next().value;
    if (oldestKey !== undefined) {
      aiResponseCache.delete(oldestKey);
    }
  }
  aiResponseCache.set(key, entry);
}

// Ensure docs directory exists
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '256kb' }));

  // Initialize Gemini AI client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // --- API Routes ---

  // 1. List all docs files (async, reads only first 512B per file for heading extraction)
  app.get('/api/docs', async (_req, res) => {
    try {
      const entries = await fsp.readdir(DOCS_DIR, { withFileTypes: true }).catch(() => []);
      const mdEntries = entries.filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'));

      const files = await Promise.all(
        mdEntries.map(async dirent => {
          const filePath = path.join(DOCS_DIR, dirent.name);
          const fallbackTitle = dirent.name.replace(/\.md$/, '');
          const [stats, title] = await Promise.all([
            fsp.stat(filePath),
            readDocHeadingOnly(filePath, fallbackTitle),
          ]);
          return {
            name: dirent.name,
            path: dirent.name,
            title,
            size: stats.size,
            updatedAt: stats.mtime,
          };
        })
      );

      files.sort((a, b) => a.name.localeCompare(b.name));
      res.json({ success: true, files });
    } catch (error: any) {
      console.error('Error listing docs:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 2. Get specific doc content
  app.get('/api/docs/:filename', async (req, res) => {
    try {
      const safe = resolveSafeDocPath(req.params.filename);
      if (!safe) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
      }

      const content = await fsp.readFile(safe.filePath, 'utf8').catch(err => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      });
      if (content === null) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      res.json({ success: true, filename: safe.filename, content });
    } catch (error: any) {
      console.error('Error reading doc:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 3. Create or update doc
  app.post('/api/docs', async (req, res) => {
    try {
      const { filename, content } = req.body ?? {};
      if (typeof filename !== 'string' || !filename.trim()) {
        return res.status(400).json({ success: false, error: 'Filename is required' });
      }

      const safe = resolveSafeDocPath(filename);
      if (!safe) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
      }

      await fsp.mkdir(DOCS_DIR, { recursive: true });
      await fsp.writeFile(safe.filePath, typeof content === 'string' ? content : '', 'utf8');
      res.json({ success: true, filename: safe.filename, message: 'Document saved successfully' });
    } catch (error: any) {
      console.error('Error saving doc:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 4. Delete doc
  app.delete('/api/docs/:filename', async (req, res) => {
    try {
      const safe = resolveSafeDocPath(req.params.filename);
      if (!safe) {
        return res.status(400).json({ success: false, error: 'Invalid filename' });
      }

      await fsp.unlink(safe.filePath).catch(err => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          const notFound = new Error('Document not found');
          (notFound as NodeJS.ErrnoException).code = 'ENOENT';
          throw notFound;
        }
        throw err;
      });
      res.json({ success: true, message: 'Document deleted successfully' });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      console.error('Error deleting doc:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 5. AI Assistant generate / polish doc (with Low thinking, input caps, dedup & LRU cache)
  app.post('/api/ai/generate', async (req, res) => {
    try {
      const { prompt, currentContent, mode } = req.body ?? {};
      if (typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ success: false, error: 'GEMINI_API_KEY is not configured' });
      }

      const normalizedMode = mode === 'polish' || mode === 'code' ? mode : 'generate';
      const cleanPrompt = compactMarkdownInput(prompt, MAX_PROMPT_CHARS);
      const cleanContext =
        normalizedMode === 'polish' && typeof currentContent === 'string'
          ? compactMarkdownInput(currentContent, MAX_CONTEXT_CHARS)
          : '';

      const cacheKey = crypto
        .createHash('sha256')
        .update(`${normalizedMode}\0${cleanPrompt}\0${cleanContext}`)
        .digest('hex');

      const cached = getCachedAiEntry(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          text: cached.text,
          cached: true,
          usage: cached.usage,
        });
      }

      let pending = inFlightAiRequests.get(cacheKey);
      if (!pending) {
        let systemInstruction =
          'Technical documentation writer. Return concise, ready-to-use Markdown with clear headings, lists, and code blocks. No filler or preamble.';
        let userQuery = cleanPrompt;

        if (normalizedMode === 'polish' && cleanContext) {
          systemInstruction =
            'Technical editor. Improve clarity, flow, and Markdown structure while preserving technical facts. Output only the revised Markdown.';
          userQuery = `Instructions: ${cleanPrompt}\n\nDocument:\n${cleanContext}`;
        } else if (normalizedMode === 'code') {
          userQuery = `Write concise code examples and API Markdown docs for: ${cleanPrompt}`;
        }

        pending = (async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: userQuery,
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
            },
          });

          const usage = {
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
          };

          const entry: AiCacheEntry = {
            text: response.text ?? '',
            usage,
            expiresAt: Date.now() + AI_CACHE_TTL_MS,
          };
          setCachedAiEntry(cacheKey, entry);
          return entry;
        })();

        inFlightAiRequests.set(cacheKey, pending);
        pending.finally(() => {
          inFlightAiRequests.delete(cacheKey);
        }).catch(() => {});
      }

      const result = await pending;
      res.json({
        success: true,
        text: result.text,
        cached: false,
        usage: result.usage,
      });
    } catch (error: any) {
      console.error('AI generation error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate AI content' });
    }
  });

  // --- Vite Dev Server Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`PWA Wrapper docs server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
