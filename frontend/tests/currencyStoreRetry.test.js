import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/settings.service', () => ({
  settingsService: { getEffective: vi.fn() },
}));

import { settingsService } from '../src/services/settings.service';
import { useCurrencyStore } from '../src/store/currencyStore';

describe('initCurrency', () => {
  it('retries a failed settings load before falling back to the defaults', async () => {
    settingsService.getEffective
      .mockRejectedValueOnce(new Error('502'))
      .mockResolvedValueOnce({ data: { 'localization.currency': 'MUR' } });
    await useCurrencyStore.getState().initCurrency({ attempts: 3, waitMs: 1 });
    expect(useCurrencyStore.getState().code).toBe('MUR');
    expect(settingsService.getEffective).toHaveBeenCalledTimes(2);
  });
});
