import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  SETUP_INDEX, SETUP_AREAS, searchSetup, scoreEntry, visibleSetupEntries,
} from '../src/utils/setupIndex';

const ADMIN = { isAdmin: true, isPlatformAdmin: false };
const PLATFORM = { isAdmin: true, isPlatformAdmin: true };
const USER = { isAdmin: false, isPlatformAdmin: false };

// ── The index itself ────────────────────────────────────────────────────────

describe('the setup index', () => {
  it('gives every entry a route, a label and a known area', () => {
    for (const entry of SETUP_INDEX) {
      expect(entry.to).toMatch(/^\//);
      expect(entry.label.length).toBeGreaterThan(2);
      expect(SETUP_AREAS[entry.area]).toBeTruthy();
    }
  });

  it('has no duplicate routes', () => {
    const routes = SETUP_INDEX.map((e) => e.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('gives every entry search vocabulary beyond its own title', () => {
    // The whole value of the finder is matching what users call things, not
    // what we call them. An entry with no keywords is only findable by someone
    // who already knows the answer.
    for (const entry of SETUP_INDEX) {
      expect(entry.keywords?.length ?? 0).toBeGreaterThan(0);
      expect(entry.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('covers every platform console page', () => {
    const platformRoutes = SETUP_INDEX.filter((e) => e.area === 'platform').map((e) => e.to);
    for (const route of [
      '/platform', '/platform/tenants', '/platform/plans', '/platform/feature-flags',
      '/platform/announcements', '/platform/analytics', '/platform/security', '/platform/audit-log',
    ]) {
      expect(platformRoutes).toContain(route);
    }
  });
});

// ── Visibility ──────────────────────────────────────────────────────────────

describe('visibility', () => {
  it('hides the platform console from a tenant admin', () => {
    const areas = new Set(visibleSetupEntries(ADMIN).map((e) => e.area));
    expect(areas.has('platform')).toBe(false);
    expect(areas.has('builder')).toBe(true);
    expect(areas.has('settings')).toBe(true);
  });

  it('shows everything to a platform admin', () => {
    const areas = new Set(visibleSetupEntries(PLATFORM).map((e) => e.area));
    expect(areas.has('platform')).toBe(true);
    expect(areas.has('builder')).toBe(true);
  });

  it('leaves a plain user only the shared tools, never the admin map', () => {
    // The finder must not double as a directory of admin pages for people who
    // cannot open them.
    const visible = visibleSetupEntries(USER);
    expect(visible.every((e) => e.area === 'tools')).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
  });
});

// ── Ranking ─────────────────────────────────────────────────────────────────

describe('scoreEntry', () => {
  const roles = SETUP_INDEX.find((e) => e.to === '/builder/roles');
  const rules = SETUP_INDEX.find((e) => e.to === '/builder/assignment');

  it('ranks an exact label match highest', () => {
    expect(scoreEntry(roles, 'Roles & Levels')).toBe(100);
  });

  it('ranks a label prefix above a keyword match', () => {
    // "roles" must find Roles & Levels, not Assignment Rules.
    expect(scoreEntry(roles, 'roles')).toBeGreaterThan(scoreEntry(rules, 'roles'));
  });

  it('matches a word inside the label', () => {
    const flags = SETUP_INDEX.find((e) => e.to === '/platform/feature-flags');
    expect(scoreEntry(flags, 'flags')).toBeGreaterThan(0);
  });

  it('scores zero when nothing matches', () => {
    expect(scoreEntry(roles, 'zzzznope')).toBe(0);
  });

  it('treats an empty query as a match for everything', () => {
    expect(scoreEntry(roles, '   ')).toBe(1);
  });
});

describe('searchSetup', () => {
  const routesFor = (q, perms = PLATFORM) => searchSetup(q, perms).map((e) => e.to);

  it('finds a page by a synonym nobody would guess from the title', () => {
    // Each of these is the word a real admin reaches for.
    expect(routesFor('picklist')).toContain('/builder/modules');
    expect(routesFor('business hours')).toContain('/builder/sla');
    expect(routesFor('round robin')).toContain('/builder/assignment');
    expect(routesFor('sso')).toContain('/platform/security');
    expect(routesFor('white label')).toContain('/builder/appearance');
    expect(routesFor('mrr')).toContain('/platform/analytics');
  });

  it('finds a setting by what it does, across surfaces', () => {
    // "currency" lives in Settings; "pricing" in the Platform console. One box
    // has to answer both, which the Builder-only search could not.
    expect(routesFor('currency')).toContain('/settings');
    expect(routesFor('pricing')).toContain('/platform/plans');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(routesFor('  PICKLIST ')).toContain('/builder/modules');
  });

  it('puts the best match first', () => {
    expect(routesFor('plans')[0]).toBe('/platform/plans');
    expect(routesFor('org chart')[0]).toBe('/builder/org-chart');
  });

  it('never returns an entry the viewer cannot open', () => {
    // "tenant" is squarely a platform concept; a tenant admin must get nothing.
    expect(routesFor('tenant', ADMIN).every((r) => !r.startsWith('/platform'))).toBe(true);
    expect(routesFor('audit log', USER)).toEqual([]);
  });

  it('returns everything visible for an empty query, up to the limit', () => {
    const all = searchSetup('', { ...PLATFORM, limit: 500 });
    expect(all).toHaveLength(SETUP_INDEX.length);
    expect(searchSetup('', { ...PLATFORM, limit: 3 })).toHaveLength(3);
  });

  it('returns nothing rather than throwing for gibberish', () => {
    expect(routesFor('qwertyuiop')).toEqual([]);
  });
});

// ── The component ───────────────────────────────────────────────────────────

const authState = { isAdmin: () => true, isPlatformAdmin: () => true };
vi.mock('../src/store/authStore', () => ({
  useAuthStore: () => authState,
}));

const { default: SetupFinder } = await import('../src/components/ui/SetupFinder');

function renderFinder() {
  return render(<MemoryRouter><SetupFinder /></MemoryRouter>);
}

const openFinder = () => fireEvent.click(screen.getByRole('button', { name: /find a setting/i }));

describe('SetupFinder', () => {
  beforeEach(() => {
    authState.isAdmin = () => true;
    authState.isPlatformAdmin = () => true;
  });

  it('opens from the trigger and closes on Escape', async () => {
    renderFinder();
    openFinder();
    const box = await screen.findByRole('dialog', { name: /find a setting/i });
    expect(box).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens on Cmd/Ctrl-K from anywhere', async () => {
    renderFinder();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByRole('dialog', { name: /find a setting/i })).toBeInTheDocument();
  });

  it('groups results by the surface they live on', async () => {
    renderFinder();
    openFinder();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'plan' } });
    // Telling the operator *where* a setting lives is half the answer.
    expect(await screen.findByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Subscription Plans')).toBeInTheDocument();
  });

  it('finds a setting by synonym and reports the result count', async () => {
    renderFinder();
    openFinder();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'picklist' } });
    expect(await screen.findByText('Modules & Objects')).toBeInTheDocument();
    expect(screen.getByText(/of \d+ settings/)).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    renderFinder();
    openFinder();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'qwertyuiop' } });
    expect(await screen.findByText(/Nothing matches/i)).toBeInTheDocument();
  });

  it('navigates on Enter and closes', async () => {
    renderFinder();
    openFinder();
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'org chart' } });
    await screen.findByText('Org Chart');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves the selection with the arrow keys', async () => {
    renderFinder();
    openFinder();
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'e' } }); // broad, several results
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true'));

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));
  });

  it('renders nothing at all for a viewer who can configure nothing admin-side', () => {
    // A plain user still has the shared tools, so the finder appears; what it
    // must never do is list pages they cannot open.
    authState.isAdmin = () => false;
    authState.isPlatformAdmin = () => false;
    renderFinder();
    openFinder();
    expect(screen.queryByText('Modules & Objects')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenants')).not.toBeInTheDocument();
  });
});
