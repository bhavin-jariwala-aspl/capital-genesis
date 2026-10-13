import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authState = { admin: false };
vi.mock('../src/store/authStore', () => {
  const state = () => ({ employee: { employee_name: 'Test User', role: 'user', tenant_id: 7 }, isAdmin: () => authState.admin, isPlatformAdmin: () => false, token: 't' });
  const useAuthStore = (sel) => (typeof sel === 'function' ? sel(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});
vi.mock('../src/services/settings.service', () => ({
  settingsService: { getEffective: vi.fn(), getPublicBranding: vi.fn(), get: vi.fn(), update: vi.fn() },
}));

import BrandLogo from '../src/components/ui/BrandLogo';
import PersonalizePanel from '../src/components/layout/PersonalizePanel';
import { useAppearanceStore } from '../src/store/appearanceStore';
import { useThemeStore } from '../src/store/themeStore';

describe('BrandLogo', () => {
  beforeEach(() => { useAppearanceStore.getState().commit({}); });

  it('renders the generated monogram and the name by default', () => {
    useAppearanceStore.getState().commit({ 'appearance.app_name': 'Acme Assurance' });
    render(<BrandLogo />);
    expect(screen.getByText('Acme Assurance')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('uses the uploaded logo, and the dark variant on dark surfaces', () => {
    useAppearanceStore.getState().commit({ 'appearance.app_name': 'Acme', 'organization.logo_url': '/l.png', 'appearance.logo_dark_url': '/l-dark.png' });
    const { rerender } = render(<BrandLogo />);
    expect(document.querySelector('img').getAttribute('src')).toBe('/l.png');
    rerender(<BrandLogo onDark />);
    expect(document.querySelector('img').getAttribute('src')).toBe('/l-dark.png');
  });

  it('honours logo_display: logo only hides the name, name only hides the mark', () => {
    useAppearanceStore.getState().commit({ 'appearance.app_name': 'Acme', 'organization.logo_url': '/l.png', 'appearance.logo_display': 'logo_only' });
    const { unmount } = render(<BrandLogo />);
    expect(screen.queryByText('Acme')).toBeNull();
    expect(document.querySelector('img').getAttribute('alt')).toBe('Acme');
    unmount();
    useAppearanceStore.getState().commit({ 'appearance.app_name': 'Acme', 'organization.logo_url': '/l.png', 'appearance.logo_display': 'name_only' });
    render(<BrandLogo />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('PersonalizePanel', () => {
  beforeEach(() => {
    authState.admin = false;
    useThemeStore.setState({ isDark: false, userChose: false, mode: null, density: null, motion: null });
    useAppearanceStore.getState().commit({});
  });

  const open = () => fireEvent.click(screen.getByRole('button', { name: /personalize appearance/i }));

  it('lets a user pick dark mode, text size and motion, and persists the choice', () => {
    render(<MemoryRouter><PersonalizePanel /></MemoryRouter>);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(useThemeStore.getState().isDark).toBe(true);
    expect(useThemeStore.getState().userChose).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(useThemeStore.getState().density).toBe('spacious');
    expect(document.documentElement.style.getPropertyValue('--base-font-size')).toBe('17px');
    fireEvent.click(screen.getByRole('button', { name: 'Reduced' }));
    expect(document.documentElement.dataset.motion).toBe('reduced');
    fireEvent.click(screen.getByRole('button', { name: /use organization defaults/i }));
    expect(useThemeStore.getState().density).toBeNull();
    expect(useThemeStore.getState().userChose).toBe(false);
  });

  it('hides the controls the organization disallows and shows admins the Studio link', () => {
    useAppearanceStore.getState().commit({ 'appearance.allow_user_mode_toggle': false, 'appearance.allow_user_density': false });
    authState.admin = true;
    render(<MemoryRouter><PersonalizePanel /></MemoryRouter>);
    open();
    expect(screen.queryByRole('button', { name: 'Dark' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Large' })).toBeNull();
    expect(screen.getByText(/sets light or dark for everyone/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /customize for everyone/i })).toHaveAttribute('href', '/builder/appearance');
  });

  it('re-applies the tenant mode on login when the toggle is disallowed', () => {
    useThemeStore.setState({ isDark: false, userChose: true, mode: 'light' });
    useAppearanceStore.getState().commit({ 'appearance.mode': 'dark', 'appearance.allow_user_mode_toggle': false });
    expect(useThemeStore.getState().isDark).toBe(true);
    // and respects the user's own choice when allowed
    useThemeStore.setState({ isDark: false, userChose: true, mode: 'light' });
    useAppearanceStore.getState().commit({ 'appearance.mode': 'dark', 'appearance.allow_user_mode_toggle': true });
    expect(useThemeStore.getState().isDark).toBe(false);
  });
});
