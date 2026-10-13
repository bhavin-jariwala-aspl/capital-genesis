import { describe, it, expect } from 'vitest';
import { matchesPath, activeLink, makeIsActive } from '../src/utils/navActive';

// The console's real link set — `/platform` is a prefix of every sibling, which
// is what the old per-link predicate got wrong.
const PLATFORM_LINKS = [
  '/platform', '/platform/tenants', '/platform/feature-flags', '/platform/plans',
  '/platform/announcements', '/platform/analytics', '/platform/security', '/platform/audit-log',
];

describe('matchesPath', () => {
  it('matches a path at or under the link', () => {
    expect(matchesPath('/reports', '/reports')).toBe(true);
    expect(matchesPath('/reports/42', '/reports')).toBe(true);
    expect(matchesPath('/reports/42/edit', '/reports')).toBe(true);
  });

  it('is segment-aware, so a shared word prefix is not a match', () => {
    expect(matchesPath('/reportsettings', '/reports')).toBe(false);
    expect(matchesPath('/platform-admin', '/platform')).toBe(false);
  });

  it('treats the root link as exact', () => {
    expect(matchesPath('/', '/')).toBe(true);
    expect(matchesPath('/reports', '/')).toBe(false);
  });

  it('ignores a trailing slash on either side', () => {
    expect(matchesPath('/platform/', '/platform')).toBe(true);
    expect(matchesPath('/platform', '/platform/')).toBe(true);
  });
});

describe('activeLink — most specific wins', () => {
  it('picks the index link only on the index path', () => {
    expect(activeLink('/platform', PLATFORM_LINKS)).toBe('/platform');
  });

  it('picks the sibling, not its prefix, on a sibling path', () => {
    // The regression: `/platform` also matches here, and used to win by virtue
    // of being evaluated on its own.
    expect(activeLink('/platform/tenants', PLATFORM_LINKS)).toBe('/platform/tenants');
    expect(activeLink('/platform/feature-flags', PLATFORM_LINKS)).toBe('/platform/feature-flags');
    expect(activeLink('/platform/audit-log', PLATFORM_LINKS)).toBe('/platform/audit-log');
  });

  it('keeps the sibling lit on its own detail pages', () => {
    expect(activeLink('/platform/tenants/7', PLATFORM_LINKS)).toBe('/platform/tenants');
  });

  it('falls back to the index link for an unlisted child', () => {
    expect(activeLink('/platform/something-new', PLATFORM_LINKS)).toBe('/platform');
  });

  it('returns null when nothing in the group matches', () => {
    expect(activeLink('/reports', PLATFORM_LINKS)).toBeNull();
  });

  it('does not depend on the order links are declared in', () => {
    const reversed = [...PLATFORM_LINKS].reverse();
    expect(activeLink('/platform/tenants', reversed)).toBe('/platform/tenants');
    expect(activeLink('/platform', reversed)).toBe('/platform');
  });

  it('accepts link objects as well as strings', () => {
    const objects = PLATFORM_LINKS.map((to) => ({ to, label: to }));
    expect(activeLink('/platform/plans', objects)).toBe('/platform/plans');
  });
});

describe('makeIsActive', () => {
  it('lights exactly one link per path across the whole console', () => {
    for (const path of [...PLATFORM_LINKS, '/platform/tenants/7']) {
      const isActive = makeIsActive(path, PLATFORM_LINKS);
      const lit = PLATFORM_LINKS.filter(isActive);
      expect(lit).toHaveLength(1);
    }
  });

  it('never lights Dashboard while a sibling page is open', () => {
    for (const path of PLATFORM_LINKS.filter((p) => p !== '/platform')) {
      expect(makeIsActive(path, PLATFORM_LINKS)('/platform')).toBe(false);
    }
  });

  it('lights nothing when the path is outside the group', () => {
    const isActive = makeIsActive('/reports', PLATFORM_LINKS);
    expect(PLATFORM_LINKS.filter(isActive)).toEqual([]);
  });

  it('keeps prefix behaviour for a group of one', () => {
    // A lone link such as /settings must still stay lit on its detail pages.
    expect(makeIsActive('/settings/localization', ['/settings'])('/settings')).toBe(true);
  });
});
