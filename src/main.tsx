import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { CrashErrorBoundary } from './components/CrashErrorBoundary.tsx';
import './index.css';
import { installGlobalCrashHandlers } from './storage/crashLogger.ts';

declare global {
  interface Window {
    __PEDIGREE_BOOT_OK__?: boolean;
    __PEDIGREE_PREFLIGHT_BLOCKED__?: boolean;
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
    registerSW({ immediate: true });
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
  }
}
