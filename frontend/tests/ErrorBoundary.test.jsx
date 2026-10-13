import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary, { useErrorHandler, isChunkLoadError } from '../src/components/ui/ErrorBoundary';

// Component that throws an error for testing
function ThrowError({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
}

// Component to test useErrorHandler hook
function TestErrorHandler() {
  const handleError = useErrorHandler();

  const triggerError = () => {
    handleError(new Error('Hook test error'), { componentStack: 'Test stack' });
  };

  return <button onClick={triggerError}>Trigger Error</button>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('renders fallback UI when error occurs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh Page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('renders custom fallback message when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const customMessage = 'Custom error message for testing';

    render(
      <ErrorBoundary fallbackMessage={customMessage}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText(customMessage)).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('does not show error details outside development mode', () => {
    // In test mode (import.meta.env.MODE === 'test'), dev details should be hidden.
    // Vite inlines MODE at compile time, so we verify the non-dev path here.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    // Error details section should NOT be present in test mode
    expect(screen.queryByText(/Error Details/)).not.toBeInTheDocument();
    // But the error UI itself should still render
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('useErrorHandler hook works correctly', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TestErrorHandler />);

    // Hook should not throw when called
    expect(() => {
      screen.getByRole('button').click();
    }).not.toThrow();

    consoleSpy.mockRestore();
  });
});

// ── Stale code chunks ────────────────────────────────────────────────────────
// Every route is a React.lazy import. When a redeploy replaces the hashed chunks
// (or the dev server restarts) an open tab asks for a module that is no longer
// served. That must recover by reloading, not dead-end on the error screen.

function ThrowChunkError({ message }) {
  throw new Error(message);
}

describe('ErrorBoundary — stale chunk recovery', () => {
  let reload;

  beforeEach(() => {
    reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    });
    window.sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('recognises how each browser words a failed dynamic import', () => {
    const yes = [
      'Failed to fetch dynamically imported module: http://localhost:5173/src/pages/runtime/ModulePage.jsx',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 42 failed.',
      'Unable to preload CSS for /assets/index-a1b2c3.css',
    ];
    for (const m of yes) expect(isChunkLoadError(new Error(m))).toBe(true);

    const chunkError = new Error('boom');
    chunkError.name = 'ChunkLoadError';
    expect(isChunkLoadError(chunkError)).toBe(true);

    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('reloads once and shows an updating message instead of the error screen', () => {
    render(
      <ErrorBoundary>
        <ThrowChunkError message="Failed to fetch dynamically imported module: /src/pages/runtime/ModulePage.jsx" />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Updating to the latest version/i)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('does not reload a second time — a module that always fails must not loop', () => {
    render(
      <ErrorBoundary>
        <ThrowChunkError message="Failed to fetch dynamically imported module: /x.jsx" />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);

    // The reload marker survives in sessionStorage, standing in for the page
    // having actually reloaded and hit the same failure again.
    render(
      <ErrorBoundary>
        <ThrowChunkError message="Failed to fetch dynamically imported module: /x.jsx" />
      </ErrorBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('leaves ordinary render errors on the normal error screen, with no reload', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow />
      </ErrorBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
