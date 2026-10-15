import { forwardRef, useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '../../utils/helpers';
import { getCurrency } from '../../utils/currency';
import { useCurrency } from '../../store/currencyStore';

/**
 * CurrencyInput — formats display as currency, stores raw number.
 * Props:
 *   value          — controlled number value
 *   onChange(num)  — called with the raw number on change
 *   currency       — ISO currency code; defaults to the tenant's currency
 *                    (BUILDER > Settings > Localization). Pass it only to force
 *                    a specific currency, e.g. on a foreign-denominated quote.
 *   hideSymbol     — show no symbol (the currency is not known yet)
 */
const CurrencyInput = forwardRef(function CurrencyInput(
  { label, error, help, required, currency, hideSymbol = false, value, onChange, className, wrapperClass, id, ...props },
  ref,
) {
  const tenantCurrency = useCurrency();
  const active = currency ? getCurrency(currency) : tenantCurrency;
  const [raw, setRaw] = useState(value !== undefined && value !== null ? String(value) : '');
  const [focused, setFocused] = useState(false);

  const handleChange = (e) => {
    const input = e.target.value.replace(/[^0-9.-]/g, '');
    setRaw(input);
    const num = parseFloat(input);
    onChange?.(isNaN(num) ? null : num);
  };

  // The symbol sits in front of the box, so the value shows the number only ("Rs 1,500.00", not "Rs MUR 1,500.00").
  const num = value !== null && value !== undefined && value !== '' ? Number(value) : null;
  const displayValue = focused ? raw : (num !== null && Number.isFinite(num)
    ? num.toLocaleString('en-US', { minimumFractionDigits: active.decimals ?? 2, maximumFractionDigits: active.decimals ?? 2 })
    : (value != null && value !== '' ? formatCurrency(value, active.code) : ''));

  return (
    <div className={clsx('group flex flex-col gap-1.5', wrapperClass)}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-focus-within:text-primary-600 dark:group-focus-within:text-primary-400 transition-colors">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {/* Symbol comes from the ISO registry, so every supported currency gets
            its own glyph instead of the three that used to be special-cased. */}
        {!hideSymbol && (
          <span className="absolute left-3 text-gray-500 dark:text-gray-400 text-sm select-none font-medium z-10">
            {active.symbol}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { setFocused(true); setRaw(value !== null && value !== undefined ? String(value) : ''); }}
          onBlur={() => setFocused(false)}
          className={clsx(
            'form-input',
            // Multi-character symbols (CHF, R$, د.إ) need more room than "$".
            hideSymbol ? null : active.symbol.length > 2 ? 'pl-14' : active.symbol.length > 1 ? 'pl-11' : 'pl-8',
            error && 'form-input-error',
            className,
          )}
          placeholder="0.00"
          {...props}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      {help && !error && <p className="form-help">{help}</p>}
    </div>
  );
});

export default CurrencyInput;
