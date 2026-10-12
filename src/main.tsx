import { createRoot } from 'react-dom/client';
import './index.css';
import { showBootCrash, AppErrorBoundary } from './crashUi';

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
  } catch (error) {
    console.error('[SANE333] boot failed', error);
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
    showBootCrash({
      where: 'window.error',
      error: event.error || event.message || 'Unknown window error',
    });
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root && root.childElementCount === 0 && !document.getElementById('sane333-crash')) {
    showBootCrash({
      where: 'unhandledrejection',
      error: event.reason || 'Unhandled promise rejection',
    });
  }
});

void boot();
