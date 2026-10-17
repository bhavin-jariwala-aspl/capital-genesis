'use strict';

/**
 * Record actions are manual workflows shown as buttons on a record. Two optional
 * keys in the workflow's `trigger_config` shape the button:
 *
 *   show_when: { field: 'status', op: 'eq' | 'neq' | 'in' | 'nin', value: 'open' }
 *     The button appears only on records that match (and the server refuses the
 *     action on any other record). `value` for in/nin is an array or a
 *     comma-separated string.
 *
 *   inputs: [{ field: 'dismiss_reason', label: 'Why?', required: true, type: 'textarea' }]
 *     The user is asked for these values first; they are saved on the record
 *     (through the record service, so validation and the audit trail apply)
 *     before the workflow runs.
 *
 *   success_message: 'Accepted — the opportunity is open at Identified.'
 *     Shown instead of the generic "<label> completed." confirmation.
 *
 * The frontend has the same check in components/runtime/RecordActions.jsx.
 */

const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim());

/** True when the action applies to a record with these values. */
function actionAvailable(triggerConfig, data) {
  const rule = triggerConfig?.show_when;
  if (!rule?.field) return true;
  const actual = String(data?.[rule.field] ?? '');
  switch (rule.op ?? 'eq') {
    case 'eq': return actual === String(rule.value ?? '');
    case 'neq': return actual !== String(rule.value ?? '');
    case 'in': return list(rule.value).includes(actual);
    case 'nin': return !list(rule.value).includes(actual);
    default: return false; // fail closed on an unknown operator
  }
}

/** The action's declared inputs, normalised. */
function actionInputs(triggerConfig) {
  return (Array.isArray(triggerConfig?.inputs) ? triggerConfig.inputs : [])
    .filter((i) => i && typeof i.field === 'string' && i.field)
    .map((i) => ({ field: i.field, label: i.label || i.field, required: i.required !== false, type: i.type || 'text' }));
}

/**
 * Pick the declared inputs out of a request body. Returns `{ values, missing }`;
 * undeclared keys are ignored so an action can never write fields it does not ask for.
 */
function pickInputs(triggerConfig, body) {
  const values = {};
  const missing = [];
  for (const i of actionInputs(triggerConfig)) {
    const raw = body?.[i.field];
    const v = typeof raw === 'string' ? raw.trim() : raw;
    if (v === undefined || v === null || v === '') {
      if (i.required) missing.push(i.label);
      continue;
    }
    values[i.field] = v;
  }
  return { values, missing };
}

module.exports = { actionAvailable, actionInputs, pickInputs };
