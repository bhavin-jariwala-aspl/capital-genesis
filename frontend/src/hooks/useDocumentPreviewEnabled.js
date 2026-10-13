import { useState, useEffect } from 'react';
import { settingsService } from '../services/settings.service';

/**
 * Whether the tenant exposes the document "Preview" button
 * (BUILDER > Document Management → Show Document Preview Button).
 *
 * The effective settings are fetched once and cached at module scope so every
 * document surface (list, panel, collection, …) shares a single request. The
 * flag defaults to `true` until the settings resolve, so the button is shown
 * optimistically and only hidden if the tenant has explicitly turned it off.
 */
let cachedPromise = null;

function fetchPreviewFlag() {
  if (!cachedPromise) {
    cachedPromise = settingsService.getEffective()
      .then((res) => {
        const values = res?.data ?? res ?? {};
        return values['documents.show_preview_button'] !== false;
      })
      .catch(() => {
        // Reset so a transient failure can be retried by the next consumer.
        cachedPromise = null;
        return true;
      });
  }
  return cachedPromise;
}

export function useDocumentPreviewEnabled() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchPreviewFlag().then((v) => { if (alive) setEnabled(v); });
    return () => { alive = false; };
  }, []);
  return enabled;
}
