/**
 * Computed Field Registry
 *
 * All computed-field logic lives here in versioned, reviewed code — never in the
 * database and never via eval() / new Function().
 *
 * How it works:
 *   - Each ui_fields.config may carry a "computed" key:
 *       { "fn": "calc_full_name", "trigger_fields": ["first_name", "last_name"], "trigger_event": "on_change" }
 *   - FormRenderer reads that key and calls computeField(fn, fields).
 *   - The switch below dispatches to the correct pure function.
 *
 * To add a new computed field behaviour:
 *   1. Add a new case here with the implementation.
 *   2. Set the field's config.computed.fn to the case name (via the builder picker).
 *   3. Deploy. No database changes required.
 *
 * @param {string} functionName  - Registered function name (matches config.computed.fn)
 * @param {Object} fields        - Current form values keyed by field_name
 * @returns {*}  New value for the target field, or undefined to leave it unchanged
 */
export function computeField(functionName, fields) {
  switch (functionName) {
    case 'calc_full_name': {
      const first = (fields.first_name || '').trim();
      const last  = (fields.last_name  || '').trim();
      return [first, last].filter(Boolean).join(' ') || null;
    }

    case 'set_probability_from_stage': {
      const stageMap = {
        prospecting:       10,
        qualification:     20,
        needs_analysis:    30,
        value_proposition: 40,
        proposal:          60,
        negotiation:       80,
        closed_won:        100,
        closed_lost:       0,
      };
      return stageMap[fields.stage] ?? null;
    }

    case 'calc_margin': {
      const price = parseFloat(fields.unit_price);
      const cost  = parseFloat(fields.cost_price);
      if (!price || price === 0 || isNaN(cost)) return null;
      return Math.round(((price - cost) / price) * 1000) / 10; // one decimal
    }

    case 'calc_age': {
      const dob = fields.date_of_birth ?? fields.birthdate;
      if (!dob) return null;
      const today = new Date();
      const birth = new Date(dob);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age >= 0 ? age : null;
    }

    default:
      // Unknown function name — no-op, leave the field value unchanged
      return undefined;
  }
}

/**
 * All registered computed-field function names.
 * Used by the builder's computed-field picker to populate the dropdown.
 */
export const COMPUTED_FIELD_FUNCTIONS = [
  { value: 'calc_full_name',             label: 'Calc Full Name (first + last)' },
  { value: 'set_probability_from_stage', label: 'Set Probability from Stage' },
  { value: 'calc_margin',                label: 'Calc Margin % (price - cost / price)' },
  { value: 'calc_age',                   label: 'Calc Age from Date of Birth' },
];
