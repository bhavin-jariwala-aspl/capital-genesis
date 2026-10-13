import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import Select from '../ui/Select';
import Input from '../ui/Input';
import { builderService } from '../../services/builder.service';

/**
 * FormulaEditor — config for a `formula` field.
 *
 * The expression is evaluated by the server on every save of the record (see
 * backend/src/services/formula.js), so it can read every field, follow lookups
 * (`party.date_of_birth`) and read other objects (LOOKUP / LATEST / SUM_RELATED).
 * The syntax is checked against the server as the admin types.
 */
const RESULT_TYPES = [
  { value: 'number:',         label: 'Number' },
  { value: 'number:currency', label: 'Money' },
  { value: 'number:percent',  label: 'Percentage' },
  { value: 'string:',         label: 'Text' },
  { value: 'date:date',       label: 'Date' },
  { value: 'boolean:checkbox', label: 'Yes / No' },
];

const EXAMPLES = [
  'PMT(interest_rate / 1200, tenure_months, loan_amount)',
  "AGE(party.date_of_birth) + tenure_months / 12",
  "LATEST('plr_rate', 'rate', 'effective_from') + LOOKUP('financial_product', 'code', product_code, 'margin')",
  "IF(risk_score >= 70, 'high', IF(risk_score >= 40, 'medium', 'low'))",
  "SUM_RELATED('loan_application', 'party', 'loan_amount', 'status', 'disbursed')",
];

export default function FormulaEditor({ cfg, setCfg, dataType, onDataType }) {
  const [expr, setExpr] = useState(cfg.expression || '');
  const [check, setCheck] = useState({ state: 'idle', error: null });

  useEffect(() => {
    if (!expr.trim()) { setCheck({ state: 'idle', error: null }); return undefined; }
    const t = setTimeout(async () => {
      try {
        const res = await builderService.checkFormula(expr);
        setCheck({ state: res.data?.error ? 'error' : 'ok', error: res.data?.error ?? null });
      } catch {
        setCheck({ state: 'idle', error: null });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [expr]);

  const resultValue = `${dataType || 'number'}:${cfg.format || ''}`;

  return (
    <div className="space-y-2">
      <label htmlFor="formula-expression" className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Formula</label>
      <textarea
        id="formula-expression"
        className="form-input text-xs font-mono"
        rows={4}
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onBlur={() => setCfg({ expression: expr.trim() })}
        placeholder="e.g. loan_amount * interest_rate / 100"
      />
      {check.state === 'ok' && <p className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Formula is valid</p>}
      {check.state === 'error' && <p className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> {check.error}</p>}
      <Select
        label="Result"
        value={resultValue}
        onChange={(e) => {
          const [dt, fmt] = e.target.value.split(':');
          onDataType(dt);
          setCfg({ format: fmt || '' });
        }}
        options={RESULT_TYPES}
      />
      {(dataType || 'number') === 'number' && (
        <Input label="Decimals" type="number" min={0} max={6} value={cfg.precision ?? ''} onChange={(e) => setCfg({ precision: e.target.value === '' ? '' : Number(e.target.value) })} />
      )}
      <details className="text-[11px] text-gray-500 dark:text-white/50">
        <summary className="cursor-pointer">Examples &amp; functions</summary>
        <ul className="mt-1 space-y-1 font-mono">
          {EXAMPLES.map((x) => (
            <li key={x}><button type="button" className="text-left hover:text-primary-600" onClick={() => { setExpr(x); setCfg({ expression: x }); }}>{x}</button></li>
          ))}
        </ul>
        <p className="mt-2">Fields by API name; follow a lookup with a dot. Functions: IF, AND, OR, NOT, CASE, IN, ROUND, MIN, MAX, PMT, AGE, ADD_MONTHS, DAYS_BETWEEN, LOOKUP, LATEST, COUNT_RELATED, SUM_RELATED, CONCAT, CONTAINS, ISBLANK, COALESCE, TODAY.</p>
      </details>
    </div>
  );
}
