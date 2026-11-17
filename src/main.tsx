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
      blockedReasons: string[];
    };
  }
}

if (typeof window !== 'undefined') {
  window.__PEDIGREE_BOOT_OK__ = true;
}

if (typeof window === 'undefined' || !window.__PEDIGREE_PREFLIGHT_BLOCKED__) {
  installGlobalCrashHandlers();

  if (import.meta.env.PROD) {
    initPwaUpdater(registerSW);
  } else if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          void caches.delete(key);
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
      window.setTimeout(() => {
        window.__PEDIGREE_MARK_BOOT_STABLE__?.();
      }, 2500);
    }
  }
}
