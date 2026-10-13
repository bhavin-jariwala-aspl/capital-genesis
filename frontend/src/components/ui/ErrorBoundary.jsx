import React from 'react';
import Alert from './Alert';
import Button from './Button';

/**
 * Every route in App.jsx is a `React.lazy` import, so its code arrives as a
 * separate chunk fetched at navigation time. That fetch can fail for reasons
 * that have nothing to do with a bug in the page:
 *
 *   • production — a redeploy replaced the hashed chunk files while someone had
 *     the app open, so the chunk their tab is asking for no longer exists;
 *   • development — the Vite dev server restarted (or was stopped) after the
 *     page loaded, so the module URL the tab holds is no longer served.
 *
 * React surfaces both as a render error, which used to dead-end the whole
 * application on the generic "Something went wrong" screen. The recovery is
 * simply to reload — the tab then fetches the current chunk manifest.
 *
 * Browsers word this failure differently, so match all of them.
 */
const CHUNK_ERROR_PATTERN = new RegExp([
  'Failed to fetch dynamically imported module', // Chrome / Edge
  'error loading dynamically imported module',   // Firefox
  'Importing a module script failed',            // Safari
  'Loading chunk \\S+ failed',                   // webpack-style bundlers
  'Unable to preload CSS',                       // Vite stylesheet preload
].join('|'), 'i');

/** Is this error a missing/stale code chunk rather than a fault in the page? */
export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  return CHUNK_ERROR_PATTERN.test(String(error.message ?? error));
}

// One automatic reload, then stop. Without the guard, a module that genuinely
// fails to parse would reload forever and hide the real error.
const RELOAD_KEY = 'genesis:chunk-reload-at';
const RELOAD_WINDOW_MS = 15_000;

/** sessionStorage is unavailable in some privacy modes — never let it throw. */
function reloadedRecently() {
  try {
    const at = Number(window.sessionStorage.getItem(RELOAD_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < RELOAD_WINDOW_MS;
  } catch {
    return false;
  }
}

function markReloaded() {
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Non-fatal: we lose the loop guard, and the render path below still
    // offers a manual Reload button.
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, isChunkError: false, reloading: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isChunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });

    // A stale chunk recovers by itself: reload once, silently.
    if (isChunkLoadError(error)) {
      if (!reloadedRecently()) {
        markReloaded();
        this.setState({ reloading: true });
        window.location.reload();
      }
      return;
    }

    // Log error to monitoring service in production
    if (import.meta.env.MODE === 'production') {
      // TODO: Send to error tracking service (e.g., Sentry)
      // eslint-disable-next-line no-console
      console.error('Error boundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // ── A code chunk could not be fetched ──────────────────────────────────
    if (this.state.isChunkError) {
      const reloading = this.state.reloading;
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            {reloading ? (
              <>
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Updating to the latest version…</p>
              </>
            ) : (
              <>
                <Alert variant="warning" className="mb-4 text-left">
                  <h3 className="font-semibold mb-2">This page could not be loaded</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {import.meta.env.MODE === 'development'
                      ? 'The development server is not serving this page. Check that it is running, then reload.'
                      : 'The application was updated while this tab was open, so part of it is no longer available. Reloading will pick up the new version.'}
                  </p>
                </Alert>
                <Button variant="primary" onClick={() => window.location.reload()} className="w-full">
                  Reload
                </Button>
              </>
            )}
          </div>
        </div>
      );
    }

    // ── Any other render error ─────────────────────────────────────────────
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <Alert variant="error" className="mb-4">
            <h3 className="font-semibold mb-2">Something went wrong</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {this.props.fallbackMessage ||
               'An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.'}
            </p>

            {import.meta.env.MODE === 'development' && this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-mono">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 dark:bg-white/10 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </Alert>

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              className="flex-1"
            >
              Refresh Page
            </Button>

            <Button
              variant="secondary"
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null, isChunkError: false })}
              className="flex-1"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

// Hook version for functional components
export function useErrorHandler() {
  return React.useCallback((error, errorInfo) => {
    if (import.meta.env.MODE === 'production') {
      // TODO: Send to error tracking service (e.g. Sentry)
      // eslint-disable-next-line no-console
      console.error('Unhandled error:', error, errorInfo);
    }
  }, []);
}

export default ErrorBoundary;
