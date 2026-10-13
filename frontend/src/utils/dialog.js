/**
 * dialog — the app-wide replacement for `alert()` / `confirm()` / `prompt()`.
 *
 * Native browser dialogs are blocking, unstyled and impossible to theme. These
 * helpers push a descriptor onto a tiny module-level queue that <DialogHost>
 * (mounted once at the app root) renders as a proper modal, and hand back a
 * promise that settles when the user answers:
 *
 *   showError(err?.response?.data?.message ?? 'Failed');           // fire & forget
 *   if (await confirmDialog(`Delete "${name}"?`)) remove(id);      // awaited
 *   const reason = await promptDialog({ title: 'Reason' });        // null on cancel
 *
 * Every helper accepts either a plain message string or a config object:
 *   { title, message, tone, confirmLabel, cancelLabel, details }
 * `tone` is one of info | success | warning | error | danger and drives the
 * accent ribbon, icon chip and primary button styling.
 */

let seq = 0;
let queue = [];
const listeners = new Set();

const emit = () => { listeners.forEach((fn) => fn()); };

/** Subscribe to queue changes — used by <DialogHost> via useSyncExternalStore. */
export function subscribeDialogs(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Current queue snapshot. Stable reference between mutations. */
export function getDialogs() {
  return queue;
}

function push(config) {
  return new Promise((resolve) => {
    queue = [...queue, { ...config, id: (seq += 1), resolve }];
    emit();
  });
}

/** Resolve and remove a dialog. Called by <DialogHost> only. */
export function settleDialog(id, value) {
  const entry = queue.find((d) => d.id === id);
  if (!entry) return;
  queue = queue.filter((d) => d.id !== id);
  emit();
  entry.resolve(value);
}

/** Accept `showError('boom')` and `showError({ title, message })` alike. */
function normalize(input, extra) {
  const base = (input && typeof input === 'object') ? input : { message: input };
  const merged = { ...extra, ...base };
  if (merged.message != null && typeof merged.message !== 'string') {
    merged.message = String(merged.message);
  }
  return merged;
}

const DEFAULT_TITLES = {
  info:    'Heads up',
  success: 'Done',
  warning: 'Check this first',
  error:   'Something went wrong',
  danger:  'Are you sure?',
};

/** Informational modal with a single dismiss button. Resolves `true`. */
function alertDialog(input, extra) {
  const cfg = normalize(input, extra);
  const tone = cfg.tone || 'info';
  return push({
    kind: 'alert',
    tone,
    title: cfg.title || DEFAULT_TITLES[tone] || DEFAULT_TITLES.info,
    confirmLabel: cfg.confirmLabel || 'Got it',
    ...cfg,
  });
}

export const showInfo    = (input, extra) => alertDialog(input, { ...extra, tone: 'info' });
export const showSuccess = (input, extra) => alertDialog(input, { ...extra, tone: 'success' });
export const showWarning = (input, extra) => alertDialog(input, { ...extra, tone: 'warning' });
export const showError   = (input, extra) => alertDialog(input, { ...extra, tone: 'error' });

/** Confirmation modal. Resolves `true` when confirmed, `false` otherwise. */
export function confirmDialog(input, extra) {
  const cfg = normalize(input, extra);
  const tone = cfg.tone || 'danger';
  return push({
    kind: 'confirm',
    tone,
    title: cfg.title || DEFAULT_TITLES[tone] || DEFAULT_TITLES.danger,
    confirmLabel: cfg.confirmLabel || 'Confirm',
    cancelLabel: cfg.cancelLabel || 'Cancel',
    ...cfg,
  });
}

/** Text-entry modal. Resolves the trimmed string, or `null` when cancelled. */
export function promptDialog(input, extra) {
  const cfg = normalize(input, extra);
  const tone = cfg.tone || 'info';
  return push({
    kind: 'prompt',
    tone,
    title: cfg.title || 'Enter a value',
    confirmLabel: cfg.confirmLabel || 'Submit',
    cancelLabel: cfg.cancelLabel || 'Cancel',
    defaultValue: cfg.defaultValue ?? '',
    ...cfg,
  });
}
