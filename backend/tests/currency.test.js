'use strict';

jest.mock('@prisma/client');

const {
  CURRENCIES,
  getCurrency,
  currencyCodes,
  currencyOptionLabels,
  formatCurrency,
  roundToCurrency,
} = require('../src/utils/currency');

const CurrencyService = require('../src/services/currency.service');
const { currencyContext, buildProfile } = CurrencyService;
const SettingsService = require('../src/services/settings.service');

/** Prisma double returning one tenant row and one set of tenant_configs. */
function makePrisma({ tenant = {}, configs = [] } = {}) {
  return {
    tenant:       { findUnique: jest.fn().mockResolvedValue(tenant) },
    tenantConfig: { findMany:   jest.fn().mockResolvedValue(configs) },
  };
}

const cfg = (key, value) => ({ config_key: key, config_value: value });

beforeEach(() => CurrencyService.invalidate());

describe('currency registry', () => {
  test('every entry is a well-formed ISO 4217 record', () => {
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.name).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect([0, 2, 3]).toContain(c.decimals);
    }
  });

  test('codes are unique', () => {
    expect(new Set(currencyCodes()).size).toBe(CURRENCIES.length);
  });

  test('getCurrency is case-insensitive and falls back to USD', () => {
    expect(getCurrency('inr').code).toBe('INR');
    expect(getCurrency('ZZZ').code).toBe('USD');
    expect(getCurrency(undefined).code).toBe('USD');
  });

  test('option labels are keyed by code and name the currency', () => {
    expect(currencyOptionLabels().JPY).toBe('JPY — Japanese Yen (¥)');
  });
});

describe('formatCurrency', () => {
  test('formats in the requested currency', () => {
    expect(formatCurrency(1234.5, { code: 'USD' })).toBe('$1,234.50');
  });

  test('honours ISO minor units — zero-decimal and three-decimal currencies', () => {
    expect(formatCurrency(1234.56, { code: 'JPY' })).toBe('¥1,235');
    expect(formatCurrency(1234.5,  { code: 'KWD' })).toContain('1,234.500');
  });

  test('uses the locale for digit grouping', () => {
    // en-IN groups in lakhs/crores, not thousands.
    expect(formatCurrency(1234567.89, { code: 'INR', locale: 'en-IN' })).toBe('₹12,34,567.89');
  });

  test('number_format overrides the separators the locale would pick', () => {
    const out = formatCurrency(1234.5, { code: 'EUR', locale: 'en-US', numberFormat: '1.234,56' });
    expect(out).toContain('1.234,50');
  });

  test('compact notation for chart axes and stat tiles', () => {
    expect(formatCurrency(1234567, { code: 'USD', compact: true })).toBe('$1.2M');
  });

  test('null, empty and non-numeric values render the fallback', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency('')).toBe('—');
    expect(formatCurrency('abc')).toBe('—');
    expect(formatCurrency(undefined, { fallback: 'n/a' })).toBe('n/a');
  });

  test('numeric strings are accepted', () => {
    expect(formatCurrency('1234.5', { code: 'USD' })).toBe('$1,234.50');
  });

  test('an unknown currency degrades to USD rather than throwing', () => {
    expect(() => formatCurrency(1, { code: 'NOPE' })).not.toThrow();
  });
});

describe('roundToCurrency', () => {
  test('rounds to the currency minor units', () => {
    expect(roundToCurrency(1234.567,  'JPY')).toBe(1235);
    expect(roundToCurrency(1234.5678, 'KWD')).toBe(1234.568);
    expect(roundToCurrency(1234.567,  'USD')).toBe(1234.57);
  });

  test('non-numeric input yields null', () => {
    expect(roundToCurrency('abc', 'USD')).toBeNull();
  });
});

describe('CurrencyService.getProfile', () => {
  test('resolves the tenant\'s localization settings', async () => {
    const prisma = makePrisma({
      tenant:  { locale: 'de' },
      configs: [cfg('localization.currency', 'EUR'), cfg('localization.number_format', '1.234,56')],
    });
    const profile = await new CurrencyService(prisma).getProfile(1);

    expect(profile.code).toBe('EUR');
    expect(profile.symbol).toBe('€');
    expect(profile.locale).toBe('de');
    expect(profile.format(1234.5)).toContain('1.234,50');
  });

  test('memoises per tenant — a second read does not hit the database', async () => {
    const prisma = makePrisma({ configs: [cfg('localization.currency', 'GBP')] });
    const svc = new CurrencyService(prisma);

    await svc.getProfile(7);
    await svc.getProfile(7);

    expect(prisma.tenantConfig.findMany).toHaveBeenCalledTimes(1);
  });

  test('invalidate() forces the next read to hit the database', async () => {
    const prisma = makePrisma({ configs: [cfg('localization.currency', 'GBP')] });
    const svc = new CurrencyService(prisma);

    await svc.getProfile(7);
    CurrencyService.invalidate(7);
    await svc.getProfile(7);

    expect(prisma.tenantConfig.findMany).toHaveBeenCalledTimes(2);
  });

  test('one tenant\'s profile is never served to another', async () => {
    const svc = new CurrencyService(makePrisma({ configs: [cfg('localization.currency', 'INR')] }));
    const a = await svc.getProfile(1);

    const svcB = new CurrencyService(makePrisma({ configs: [cfg('localization.currency', 'JPY')] }));
    const b = await svcB.getProfile(2);

    expect(a.code).toBe('INR');
    expect(b.code).toBe('JPY');
  });

  test('a settings failure degrades to USD instead of throwing', async () => {
    const prisma = makePrisma();
    prisma.tenantConfig.findMany.mockRejectedValue(new Error('db down'));

    const profile = await new CurrencyService(prisma).getProfile(1);
    expect(profile.code).toBe('USD');
  });

  test('a missing tenant id yields the fallback without querying', async () => {
    const prisma = makePrisma();
    const profile = await new CurrencyService(prisma).getProfile(undefined);

    expect(profile.code).toBe('USD');
    expect(prisma.tenantConfig.findMany).not.toHaveBeenCalled();
  });
});

describe('currency context (AsyncLocalStorage)', () => {
  test('activeProfile falls back to USD with no context in scope', () => {
    expect(CurrencyService.activeProfile().code).toBe('USD');
  });

  test('withProfile installs the tenant profile for the callback', async () => {
    const prisma = makePrisma({ configs: [cfg('localization.currency', 'INR')] });

    const seen = await new CurrencyService(prisma).withProfile(1, () =>
      CurrencyService.activeProfile().code,
    );

    expect(seen).toBe('INR');
    expect(CurrencyService.activeProfile().code).toBe('USD'); // restored after
  });

  test('concurrent renders never see each other\'s currency', async () => {
    const profiles = {
      INR: buildProfile({ code: 'INR', locale: 'en-IN', numberFormat: '1,234.56' }),
      JPY: buildProfile({ code: 'JPY', locale: 'ja',    numberFormat: '1,234.56' }),
    };

    const render = (code) => currencyContext.run(profiles[code], async () => {
      await new Promise((r) => setTimeout(r, code === 'INR' ? 20 : 1));
      return CurrencyService.activeProfile().code;
    });

    const results = await Promise.all([render('INR'), render('JPY'), render('INR')]);
    expect(results).toEqual(['INR', 'JPY', 'INR']);
  });
});

describe('settings schema wiring', () => {
  const localization = () => SettingsService.schema.find((g) => g.key === 'localization');
  const currencySetting = () => localization().settings.find((s) => s.key === 'currency');

  test('the currency picker is driven by the registry', () => {
    expect(currencySetting().options).toEqual(currencyCodes());
    expect(currencySetting().default).toBe('USD');
  });

  test('every offered code has a readable label', () => {
    const labels = currencySetting().option_labels;
    for (const code of currencySetting().options) expect(labels[code]).toContain(code);
  });

  test('an unsupported currency is rejected on save', async () => {
    const prisma = makePrisma();
    prisma.$transaction = jest.fn().mockResolvedValue([]);

    await expect(
      new SettingsService(prisma).updateSettings(1, 'admin', { 'localization.currency': 'FAKE' }),
    ).rejects.toThrow(/Invalid value for currency/);
  });

  test('saving localization drops the memoised profile', async () => {
    const prisma = makePrisma({ configs: [cfg('localization.currency', 'USD')] });
    prisma.$transaction = jest.fn().mockResolvedValue([]);
    prisma.tenantConfig.upsert = jest.fn();
    prisma.tenant.update = jest.fn();

    const currencySvc = new CurrencyService(prisma);
    expect((await currencySvc.getProfile(1)).code).toBe('USD');

    // The tenant switches to EUR through the settings service…
    prisma.tenantConfig.findMany.mockResolvedValue([cfg('localization.currency', 'EUR')]);
    await new SettingsService(prisma).updateSettings(1, 'admin', { 'localization.currency': 'EUR' });

    // …and the very next read reflects it, rather than waiting out the TTL.
    expect((await currencySvc.getProfile(1)).code).toBe('EUR');
  });
});
