import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { CrashErrorBoundary } from './components/CrashErrorBoundary.tsx';
import './index.css';
import { installGlobalCrashHandlers } from './storage/crashLogger.ts';

installGlobalCrashHandlers();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <CrashErrorBoundary>
    <App />
  </CrashErrorBoundary>
);
