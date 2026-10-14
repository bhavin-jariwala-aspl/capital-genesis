import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/settings.service', () => ({
  settingsService: { getPublicBranding: vi.fn(), getEffective: vi.fn() },
}));

import { settingsService } from '../src/services/settings.service';
import { useAppearanceStore } from '../src/store/appearanceStore';
import { saveBrandingSnapshot, resolveAppearance } from '../src/utils/appearance';

const primary = () => document.documentElement.style.getPropertyValue('--p-500').trim();

describe('public pages wear their workspace theme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAppearanceStore.setState({ publicTenant: null, preLogin: null });
  });

  it('applies the workspace\'s published colours', async () => {
    settingsService.getPublicBranding.mockResolvedValue({ data: { 'organization.primary_color': '#0f766e' } });
    await useAppearanceStore.getState().wearWorkspace(7);
    expect(settingsService.getPublicBranding).toHaveBeenCalledWith(7);
    expect(useAppearanceStore.getState().current['organization.primary_color']).toBe('#0f766e');
    expect(primary()).not.toBe('99 102 241'); // no longer the default indigo
  });

  it('is not overwritten when the remembered sign-in brand arrives later', async () => {
    saveBrandingSnapshot(resolveAppearance({ 'organization.primary_color': '#b91c1c' }), 3);
    let releaseOld;
    settingsService.getPublicBranding.mockImplementation((id) => (id === 3
      ? new Promise((ok) => { releaseOld = () => ok({ data: { 'organization.primary_color': '#b91c1c' } }); })
      : Promise.resolve({ data: { 'organization.primary_color': '#0f766e' } })));

    const preLogin = useAppearanceStore.getState().applyPreLoginBranding(); // App, signed out
    await useAppearanceStore.getState().wearWorkspace(7);                   // the portal page
    releaseOld();
    await preLogin;
    expect(useAppearanceStore.getState().current['organization.primary_color']).toBe('#0f766e');
  });

  it('keeps rendering when branding cannot be fetched', async () => {
    settingsService.getPublicBranding.mockRejectedValue(new Error('offline'));
    await expect(useAppearanceStore.getState().wearWorkspace(7)).resolves.toBeTruthy();
  });
});
