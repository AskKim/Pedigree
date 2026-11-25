import './utils/es2018Shims';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { CrashErrorBoundary } from './components/CrashErrorBoundary.tsx';
import './index.css';
import { installGlobalCrashHandlers } from './storage/crashLogger.ts';
import { initPwaUpdater } from './storage/pwaUpdateManager.ts';

declare global {
  interface Window {
    __PEDIGREE_BOOT_OK__?: boolean;
    __PEDIGREE_PREFLIGHT_BLOCKED__?: boolean;
    __PEDIGREE_RECORD_BOOT_CRASH__?: () => void;
    __PEDIGREE_MARK_BOOT_STABLE__?: () => void;
    __PEDIGREE_PREFLIGHT__?: {
      passed: boolean;
      wasmSupported: boolean;
      indexedDbAvailable?: boolean;
      blockedReasons: string[];
    };
  }
}

if (typeof window === 'undefined' || !window.__PEDIGREE_PREFLIGHT_BLOCKED__) {
  installGlobalCrashHandlers();

  if (import.meta.env.PROD) {
    initPwaUpdater(registerSW);
  } else if (typeof window !== 'undefined') {
    const hadActiveController = Boolean(
      'serviceWorker' in navigator && navigator.serviceWorker?.controller
    );
    const cleanupTasks: Promise<unknown>[] = [];
    try {
      if ('serviceWorker' in navigator && typeof navigator.serviceWorker?.getRegistrations === 'function') {
        cleanupTasks.push(
          navigator.serviceWorker.getRegistrations()
            .then((regs) => Promise.all(regs.map((reg) => reg.unregister().catch(() => false))))
            .catch(() => [])
        );
      }
    } catch {
      // Ignore restricted serviceWorker access
    }
    try {
      if ('caches' in window && window.caches?.keys) {
        cleanupTasks.push(
          window.caches
            .keys()
            .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key).catch(() => false))))
            .catch(() => [])
        );
      }
    } catch {
      // Ignore restricted CacheStorage access
    }
    if (hadActiveController && cleanupTasks.length > 0) {
      void Promise.all(cleanupTasks).then(() => {
        try {
          const reloadKey = 'pedigree_dev_sw_cleanup_reload_ts';
          const prev = Number(window.sessionStorage?.getItem(reloadKey) || 0);
          const now = Date.now();
          if (!Number.isFinite(prev) || now - prev > 15000) {
            window.sessionStorage?.setItem(reloadKey, String(now));
            window.sessionStorage?.removeItem('pedigree_pending_boot_ts');
            window.location.reload();
          }
        } catch {
          // Ignore restricted sessionStorage
        }
      });
    }
  }

  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(
      <CrashErrorBoundary>
        <App />
      </CrashErrorBoundary>
    );
    if (typeof window !== 'undefined') {
      window.__PEDIGREE_BOOT_OK__ = true;
    }
  }
}
