/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * PWA Wrapper — AI Studio Companion Documentation Hub & Bridge Playground
 * Provides a live browser/editor for `/docs/*.md`, a REST API playground for `/api/*`,
 * and an 800ms header long-press test hook wired to `pedigreeBridge.openNativeDevPanel()`.
 * (Not bundled inside the Android APK; see `android-wrapper/` for the native shell.)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, Plus, Search, Edit3, Eye, Trash2, Save, Sparkles, 
  FolderOpen, Terminal, BookOpen, Moon, Sun, Copy, Check, 
  RefreshCw, Send, Code2
} from 'lucide-react';
import { marked } from 'marked';
import { pedigreeBridge } from './native/pedigreeBridge';

interface DocFile {
  name: string;
  path: string;
  title: string;
  size: number;
  updatedAt: string;
}

export default function App() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  
  // AI Modal & Assistant State
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiMode, setAiMode] = useState<'generate' | 'polish'>('generate');
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // New Doc Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newFilename, setNewFilename] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');

  // API Playground State
  const [activeTab, setActiveTab] = useState<'docs' | 'playground'>('docs');
  const [apiEndpoint, setApiEndpoint] = useState<string>('/api/docs');
  const [apiMethod, setApiMethod] = useState<string>('GET');
  const [apiPayload, setApiPayload] = useState<string>('');
  const [apiResponse, setApiResponse] = useState<string>('// Select an endpoint and click Send Request');
  const [apiLoading, setApiLoading] = useState<boolean>(false);

  // Copy & inline delete confirmation state
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<string | null>(null);

  // Refs for timers and current selection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedFileRef = useRef<string | null>(selectedFile);
  selectedFileRef.current = selectedFile;
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      if (deleteConfirmTimerRef.current) clearTimeout(deleteConfirmTimerRef.current);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    startPosRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pedigreeBridge.openNativeDevPanel();
      setActiveTab('playground');
    }, 800);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - startPosRef.current.x);
    const dy = Math.abs(e.clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Register back button handler
  useEffect(() => {
    const unregister = pedigreeBridge.registerBackHandler(() => {
      if (showAiModal) {
        setShowAiModal(false);
        return true;
      }
      if (showNewModal) {
        setShowNewModal(false);
        return true;
      }
      if (selectedFile && isEditing) {
        setIsEditing(false);
        return true;
      }
      return false;
    });
    return unregister;
  }, [showAiModal, showNewModal, selectedFile, isEditing]);

  // Initialize dark mode class on html root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Fetch files list on mount
  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/docs');
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
        if (data.files.length > 0 && !selectedFileRef.current) {
          selectDocument(data.files[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch docs:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectDocument = async (filename: string) => {
    setSelectedFile(filename);
    setIsEditing(false);
    setConfirmDeleteFile(null);
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`);
      const data = await res.json();
      if (data.success) {
        setContent(data.content);
      }
    } catch (err) {
      console.error('Failed to read document:', err);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile, content }),
      });
      const data = await res.json();
      if (data.success) {
        void import('canvas-confetti')
          .then((mod) => mod.default({ particleCount: 50, spread: 60, origin: { y: 0.8 } }))
          .catch(() => {});
        fetchDocs();
      }
    } catch (err) {
      console.error('Failed to save document:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteFile !== filename) {
      setConfirmDeleteFile(filename);
      if (deleteConfirmTimerRef.current) clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = setTimeout(() => {
        setConfirmDeleteFile((prev) => (prev === filename ? null : prev));
      }, 4000);
      return;
    }

    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
    setConfirmDeleteFile(null);

    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (selectedFileRef.current === filename) {
          setSelectedFile(null);
          setContent('');
        }
        fetchDocs();
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilename) return;
    let filename = newFilename.trim();
    if (!filename.endsWith('.md')) filename += '.md';

    const initialContent = `# ${newTitle || filename.replace('.md', '')}\n\nStart writing your technical documentation here...\n`;

    try {
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content: initialContent }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewModal(false);
        setNewFilename('');
        setNewTitle('');
        await fetchDocs();
        selectDocument(filename);
      }
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  };

  const handleAiAction = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          currentContent: aiMode === 'polish' ? content : undefined,
          mode: aiMode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (aiMode === 'polish' || aiMode === 'generate' && selectedFile) {
          setContent(data.text);
          setIsEditing(true);
        } else {
          // Create new file from AI
          const titleMatch = aiPrompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
          const filename = `${titleMatch || 'ai-doc'}.md`;
          await fetch('/api/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content: data.text }),
          });
          await fetchDocs();
          selectDocument(filename);
        }
        setShowAiModal(false);
        setAiPrompt('');
      }
    } catch (err) {
      console.error('AI generation failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const runApiPlayground = async () => {
    setApiLoading(true);
    try {
      let options: RequestInit = { method: apiMethod };
      if (apiMethod === 'POST') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = apiPayload;
      }
      const res = await fetch(apiEndpoint, options);
      const json = await res.json();
      setApiResponse(JSON.stringify(json, null, 2));
    } catch (err: any) {
      setApiResponse(`Error: ${err.message}`);
    } finally {
      setApiLoading(false);
    }
  };

  const filteredFiles = useMemo(() => {
    return files.filter(f => 
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [files, searchQuery]);

  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(content || '', { async: false }) as string;
    } catch {
      return '<p>Error rendering markdown</p>';
    }
  }, [content]);

  const wordCount = useMemo(() => {
    const trimmed = content ? content.trim() : '';
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [content]);

  const readingTime = Math.ceil(wordCount / 200);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* Top Bar Contract (Brand - 4 Nav Links - 1 Primary Action) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        {/* Zone 1: Brand Wordmark */}
        <div 
          className="flex items-center gap-3 shrink-0 cursor-pointer select-none touch-manipulation"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          title="Community Pedigree (Hold 800ms for Dev Panel)"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">PWA Wrapper</span>
            <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
              {pedigreeBridge.isNativeWrapper() ? `${pedigreeBridge.getPlatform().toUpperCase()} Native` : 'Docs Hub'}
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button 
            onClick={() => setActiveTab('docs')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${activeTab === 'docs' ? 'border-indigo-600 text-slate-900 dark:text-white font-semibold' : 'border-transparent hover:text-slate-900 dark:hover:text-white'}`}
          >
            Documentation Workspace
          </button>
          <button 
            onClick={() => setActiveTab('playground')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${activeTab === 'playground' ? 'border-indigo-600 text-slate-900 dark:text-white font-semibold' : 'border-transparent hover:text-slate-900 dark:hover:text-white'}`}
          >
            API Playground
          </button>
          <a href="#architecture" onClick={() => { setActiveTab('docs'); selectDocument('architecture.md'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
            Architecture
          </a>
          <a href="#deployment" onClick={() => { setActiveTab('docs'); selectDocument('deployment.md'); }} className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
            Deployment
          </a>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowAiModal(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/65 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Writer
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        
        {activeTab === 'docs' ? (
          <>
            {/* Sidebar File Tree */}
            <aside className="w-80 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FolderOpen className="w-4 h-4 text-indigo-500" />
                    <span>/docs Folder</span>
                  </div>
                  <button 
                    onClick={fetchDocs} 
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    title="Refresh folder"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                  />
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {loading ? (
                  <div className="text-center py-8 text-xs text-slate-400">Loading documentation...</div>
                ) : filteredFiles.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">No documents found</div>
                ) : (
                  filteredFiles.map((file) => {
                    const isSelected = selectedFile === file.name;
                    return (
                      <div
                        key={file.name}
                        onClick={() => selectDocument(file.name)}
                        className={`group flex items-center justify-between p-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/80 shadow-xs' 
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
                          <span className="truncate">{file.title}</span>
                        </div>
                        <div className={`flex items-center gap-1 transition-opacity ${confirmDeleteFile === file.name ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button
                            onClick={(e) => handleDelete(file.name, e)}
                            className={`px-1.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                              confirmDeleteFile === file.name
                                ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25'
                                : 'text-slate-400 hover:text-red-500'
                            }`}
                            title={confirmDeleteFile === file.name ? 'Click again to confirm deletion' : 'Delete document'}
                          >
                            {confirmDeleteFile === file.name ? 'Delete?' : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Sidebar Footer Metadata */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                <span>{files.length} markdown documents</span>
                <span className="font-mono">/docs/*.md</span>
              </div>
            </aside>

            {/* Content Workspace */}
            <section className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
              {selectedFile ? (
                <>
                  {/* Workspace Header */}
                  <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{selectedFile}</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{wordCount} words</span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{readingTime} min read</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isEditing
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                        {isEditing ? 'Preview' : 'Edit'}
                      </button>

                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>

                  {/* Editor or Preview Pane */}
                  <div className="flex-1 flex overflow-hidden">
                    {isEditing ? (
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full h-full p-6 font-mono text-xs md:text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 resize-none focus:outline-none leading-relaxed"
                        placeholder="Write markdown here..."
                      />
                    ) : (
                      <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-4xl mx-auto w-full">
                        <div 
                          className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 space-y-4 text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderedHtml }}
                        />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <BookOpen className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
                  <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">No Document Selected</h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">Choose a document from the sidebar folder browser or create a new one to begin reading and editing.</p>
                </div>
              )}
            </section>
          </>
        ) : (
          /* API Playground Tab */
          <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto max-w-6xl mx-auto w-full">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">PWA Wrapper API Playground</h2>
              <p className="text-xs text-slate-500 mt-1">Test the companion documentation server REST API endpoints directly from your browser.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Request Builder */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col gap-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-500" />
                  Request Builder
                </h3>

                <div className="flex gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value)}
                    className="px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="DELETE">DELETE</option>
                  </select>

                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                    placeholder="/api/docs"
                  />
                </div>

                {apiMethod === 'POST' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Request Body (JSON)</label>
                    <textarea
                      value={apiPayload}
                      onChange={(e) => setApiPayload(e.target.value)}
                      rows={6}
                      className="w-full p-3 font-mono text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                      placeholder={'{\n  "filename": "test.md",\n  "content": "# Test\\nHello world"\n}'}
                    />
                  </div>
                )}

                <button
                  onClick={runApiPlayground}
                  disabled={apiLoading}
                  className="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {apiLoading ? 'Sending Request...' : 'Send API Request'}
                </button>
              </div>

              {/* Response Viewer */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-emerald-500" />
                    Response Output
                  </h3>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(apiResponse).catch(() => {});
                      setCopiedCode('response');
                      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
                      copiedTimerRef.current = setTimeout(() => setCopiedCode(null), 2000);
                    }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    {copiedCode === 'response' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode === 'response' ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="flex-1 p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded-lg overflow-x-auto max-h-[350px] leading-relaxed">
                  {apiResponse}
                </pre>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* AI Writer Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Gemini AI Documentation Assistant</h3>
                  <p className="text-xs text-slate-500">Generate or polish technical documentation instantly.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAiModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setAiMode('generate')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  aiMode === 'generate'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Generate New Guide
              </button>
              <button
                onClick={() => setAiMode('polish')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  aiMode === 'polish'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Polish Current Doc
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {aiMode === 'generate' ? 'Describe the topic or guide you want to write:' : 'Instructions for polishing and enhancing:'}
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                placeholder={aiMode === 'generate' ? 'e.g., Write documentation for a rate-limiting middleware using Redis...' : 'e.g., Make the tone more professional and add a code example...'}
                className="w-full p-3 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAiAction}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiLoading ? 'Generating AI Content...' : 'Generate with Gemini'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Document Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateNew} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Create New Document</h3>
              <button 
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Filename (.md)</label>
                <input
                  type="text"
                  required
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  placeholder="e.g. security-guide.md"
                  className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Document Title (H1)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Security & Authentication Guide"
                  className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                Create Document
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
