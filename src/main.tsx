import { createRoot } from 'react-dom/client';
import './index.css';
import { showBootCrash, AppErrorBoundary } from './crashUi';

// Stale chunk after a redeploy: the browser holds the old entry, the old App
// chunk is gone from the server, and the dynamic import fails with
// "Failed to fetch dynamically imported module". That is not a code bug —
// a fresh load fixes it. Reload once automatically; the session flag stops
// reload loops, and a successful boot clears it so a later stale chunk gets
// its own single retry.
const CHUNK_RELOAD_KEY = 'sane333:chunk-reload-v1';

function isChunkLoadError(error: unknown): boolean {
  const text = String((error as any)?.message || error || '');
  return /Failed to fetch dynamically imported module/i.test(text)
    || /Importing a module script failed/i.test(text)
    || /Loading chunk [\w\d]+ failed/i.test(text)
    || /ChunkLoadError/i.test(text);
}

function reloadOnceForStaleChunk(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    if (window.sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

async function boot() {
  try {
    const [{ default: App }, { startBackgroundRuntime }, { cleanupOldDemoData }, { bindLineRuntimeEvents }] =
      await Promise.all([
        import('./App.tsx'),
        import('./store/backgroundRuntime'),
        import('./store/blankPhoneMigration'),
        import('./store/lineRuntime'),
      ]);

    if (typeof window !== 'undefined') {
      cleanupOldDemoData();
      startBackgroundRuntime();
      bindLineRuntimeEvents();

      // The app no longer uses a service worker. Clean up legacy registrations
      // immediately so an older cached shell cannot keep serving stale builds.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        );
      }
      if ('caches' in window) {
        void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      }
    }

    const rootEl = document.getElementById('root');
    if (!rootEl) {
      showBootCrash({ where: 'boot', error: new Error('#root missing in index.html') });
      return;
    }

    createRoot(rootEl).render(
      <AppErrorBoundary where="app-root" onReset={() => window.location.reload()} resetLabel="重新加载">
        <App />
      </AppErrorBoundary>,
    );

    // Boot succeeded: a later stale chunk may use its own single retry.
    window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* ignore */
      }
    }, 5000);
  } catch (error) {
    console.error('[SANE333] boot failed', error);
    if (reloadOnceForStaleChunk(error)) return;
    showBootCrash({
      title: '有问题 · 待修复',
      where: 'boot / module-load',
      error,
    });
  }
}

window.addEventListener('error', (event) => {
  // Only surface fatal boot blanks — React boundaries handle in-app renders.
  const root = document.getElementById('root');
  if (root && root.childElementCount === 0 && !document.getElementById('sane333-crash')) {
    if (reloadOnceForStaleChunk(event.error || event.message)) return;
    showBootCrash({
      where: 'window.error',
      error: event.error || event.message || 'Unknown window error',
    });
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root && root.childElementCount === 0 && !document.getElementById('sane333-crash')) {
    if (reloadOnceForStaleChunk(event.reason)) return;
    showBootCrash({
      where: 'unhandledrejection',
      error: event.reason || 'Unhandled promise rejection',
    });
  }
});

void boot();
