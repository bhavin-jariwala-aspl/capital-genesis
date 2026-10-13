import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { featureForPath, ROUTE_FEATURE, FEATURE_LABEL } from '../src/utils/featureMap';

// ── The route → feature map ─────────────────────────────────────────────────

describe('featureForPath', () => {
  it('maps every gated page to a feature, longest prefix first', () => {
    expect(featureForPath('/insurance/claims')).toBe('ins_claims');
    expect(featureForPath('/insurance/underwriting/42')).toBe('ins_underwriting');
    expect(featureForPath('/builder/integration-health')).toBe('plat_integrations');
    expect(featureForPath('/reports/7/edit')).toBe('analytics_reports');
  });

  it('leaves ungated pages alone', () => {
    // These are core: a plan that removed them would remove the product.
    for (const p of ['/', '/module/3', '/reminders', '/builder/modules', '/builder/employees', '/settings', '/platform/tenants']) {
      expect(featureForPath(p), p).toBeNull();
    }
  });

  it('does not match a route that merely shares a word prefix', () => {
    expect(featureForPath('/slack')).toBeNull();      // not /sla
    expect(featureForPath('/documentsx')).toBeNull(); // not /documents
  });

  it('labels every feature the map can lock', () => {
    for (const [, key] of ROUTE_FEATURE) expect(FEATURE_LABEL[key], key).toBeTruthy();
  });
});

// ── The store-backed hook and the gate ──────────────────────────────────────

const meta = { entitlements: null };
const auth = { isPlatformAdmin: () => false, isAdmin: () => false, token: 't', employee: { role: 'user', role_level: 5 } };

vi.mock('../src/store/metadataStore', () => ({
  useMetadataStore: (sel) => (sel ? sel(meta) : meta),
}));
vi.mock('../src/store/authStore', () => ({
  useAuthStore: (sel) => (sel ? sel(auth) : auth),
}));

const { useEntitlements } = await import('../src/hooks/useEntitlements');
const { default: FeatureGate, LockedFeature } = await import('../src/components/layout/FeatureGate');
const { default: ProtectedRoute } = await import('../src/components/layout/ProtectedRoute');

function Probe() {
  const { has, loaded, plan } = useEntitlements();
  return <div data-testid="probe">{`${loaded}|${plan ?? '-'}|${has('ins_claims')}|${has('ins_quoting')}`}</div>;
}

const renderAt = (path, tree) => render(<MemoryRouter initialEntries={[path]}>{tree}</MemoryRouter>);

describe('useEntitlements', () => {
  beforeEach(() => { meta.entitlements = null; auth.isPlatformAdmin = () => false; });

  it('reports everything available until bootstrap has delivered a list', () => {
    // Fail open on the client: hiding half the product because a sync is slow
    // would be worse than a 403 the server produces anyway.
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('false|-|true|true');
  });

  it('reads the plan and gates on the delivered features', () => {
    meta.entitlements = { plan: 'starter', features: ['ins_quoting'], locked: {} };
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('true|starter|false|true');
  });

  it('never gates a platform admin', () => {
    meta.entitlements = { plan: 'free', features: [], locked: {} };
    auth.isPlatformAdmin = () => true;
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('true|free|true|true');
  });
});

describe('FeatureGate', () => {
  beforeEach(() => {
    meta.entitlements = {
      plan: 'starter',
      features: ['ins_quoting'],
      locked: { ins_claims: { source: 'plan_excluded', reason: 'Not included in the starter plan — requires professional' } },
    };
    auth.isPlatformAdmin = () => false;
    auth.isAdmin = () => false;
  });

  const tree = (
    <Routes>
      <Route element={<FeatureGate />}>
        <Route path="/insurance/claims" element={<div>CLAIMS PAGE</div>} />
        <Route path="/insurance/quotes" element={<div>QUOTES PAGE</div>} />
        <Route path="/reminders" element={<div>REMINDERS PAGE</div>} />
      </Route>
    </Routes>
  );

  it('renders an entitled page', () => {
    renderAt('/insurance/quotes', tree);
    expect(screen.getByText('QUOTES PAGE')).toBeInTheDocument();
  });

  it('replaces a locked page with an explanation, using the server reason', () => {
    // A redirect home reads as a bug; a page that names the feature and the
    // tier turns the dead end into the one moment an upgrade is relevant.
    renderAt('/insurance/claims', tree);
    expect(screen.queryByText('CLAIMS PAGE')).not.toBeInTheDocument();
    expect(screen.getByText('Claims management')).toBeInTheDocument();
    expect(screen.getByText(/requires professional/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to dashboard/i })).toBeInTheDocument();
  });

  it('passes an ungated page straight through', () => {
    renderAt('/reminders', tree);
    expect(screen.getByText('REMINDERS PAGE')).toBeInTheDocument();
  });

  it('offers the upgrade path only to an admin', () => {
    renderAt('/insurance/claims', tree);
    expect(screen.queryByText(/Ask about upgrading/)).not.toBeInTheDocument();
    auth.isAdmin = () => true;
    renderAt('/insurance/claims', tree);
    expect(screen.getByText(/Ask about upgrading/)).toBeInTheDocument();
  });

  it('falls back to a generic sentence when the server gave no reason', () => {
    meta.entitlements = { plan: 'starter', features: [], locked: {} };
    render(<MemoryRouter><LockedFeature featureKey="ins_claims" /></MemoryRouter>);
    expect(screen.getByText(/not included in the starter plan/)).toBeInTheDocument();
  });
});

describe('ProtectedRoute — authority by level, not name', () => {
  const tree = (
    <Routes>
      <Route element={<ProtectedRoute roles={['admin', 'super_admin', 'platform_admin']} />}>
        <Route path="/builder" element={<div>BUILDER</div>} />
      </Route>
      <Route path="/" element={<div>HOME</div>} />
    </Routes>
  );

  it('admits a custom tenant role at admin level', () => {
    // The regression: the old name check turned this role away while the
    // server's level-based guard would have admitted it.
    auth.employee = { role: 'regional_admin', role_level: 3 };
    renderAt('/builder', tree);
    expect(screen.getByText('BUILDER')).toBeInTheDocument();
  });

  it('turns away a level-5 user however it is named', () => {
    auth.employee = { role: 'admin_assistant', role_level: 5 };
    renderAt('/builder', tree);
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('honours minLevel directly', () => {
    auth.employee = { role: 'manager', role_level: 4 };
    renderAt('/builder', (
      <Routes>
        <Route element={<ProtectedRoute minLevel={4} />}><Route path="/builder" element={<div>BUILDER</div>} /></Route>
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    ));
    expect(screen.getByText('BUILDER')).toBeInTheDocument();
  });

  it('falls back to the role name for a token without a level', () => {
    auth.employee = { role: 'admin' };
    renderAt('/builder', tree);
    expect(screen.getByText('BUILDER')).toBeInTheDocument();
    auth.employee = { role: 'user' };
    renderAt('/builder', tree);
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });
});
