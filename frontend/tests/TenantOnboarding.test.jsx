import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  slugify, suggestEmployeeId, generatePassword, passwordStrength, ProvisioningReport,
} from '../src/pages/platform/TenantOnboardWizard';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('matches the server derivation for ordinary names', () => {
    // Kept in step with `slugify` in backend/src/services/platform/tenant.service.js —
    // the wizard shows the operator the slug the server will actually store.
    expect(slugify('Acme Life Insurance')).toBe('acme-life-insurance');
    expect(slugify('Acme Insurance Group, Inc.')).toBe('acme-insurance-group-inc');
    expect(slugify('  Hello   World  ')).toBe('hello-world');
  });

  it('folds accents rather than dropping the letters', () => {
    expect(slugify('Café Assurance')).toBe('cafe-assurance');
  });

  it('never produces a leading or trailing hyphen', () => {
    expect(slugify('!!! Acme !!!')).toBe('acme');
    expect(slugify(`${'a'.repeat(99)} b`).endsWith('-')).toBe(false);
  });

  it('is empty for input with nothing slug-worthy in it', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('suggestEmployeeId', () => {
  it('seeds an id from the workspace name', () => {
    expect(suggestEmployeeId('Acme Life')).toBe('ACMELIFE_ADMIN');
  });

  it('stays inside the 20-character column', () => {
    const id = suggestEmployeeId('Extraordinarily Long Organisation Name');
    expect(id.length).toBeLessThanOrEqual(20);
    expect(id).toMatch(/^[A-Z0-9_]+$/);
  });

  it('is empty when the name has no usable characters, so no bad id is offered', () => {
    expect(suggestEmployeeId('!!!')).toBe('');
  });
});

describe('generatePassword', () => {
  it('is long, varied and never two the same', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).toHaveLength(18);
    expect(a).not.toBe(b);
    expect(new Set(a).size).toBeGreaterThan(6);
  });

  it('omits glyphs that are misread when a password is read aloud', () => {
    // No 0/O/1/l/I — these get handed over verbally or on paper.
    const sample = Array.from({ length: 40 }, () => generatePassword(40)).join('');
    expect(sample).not.toMatch(/[0O1lI]/);
  });

  it('rates as strong under the wizard own meter', () => {
    expect(passwordStrength(generatePassword()).score).toBe(4);
  });
});

describe('passwordStrength', () => {
  it('flags anything the server would reject', () => {
    expect(passwordStrength('short').label).toMatch(/8 characters/);
    expect(passwordStrength('').score).toBe(0);
  });

  it('ranks longer and more varied passwords higher', () => {
    const weak = passwordStrength('aaaaaaaa').score;
    const fair = passwordStrength('Password1').score;
    const strong = passwordStrength('Tr0ub4dor&3-longer-still').score;
    expect(weak).toBeLessThan(fair);
    expect(fair).toBeLessThan(strong);
  });
});

// ── The report the wizard shows instead of a bare "Created" toast ────────────

describe('ProvisioningReport', () => {
  it('names every step and its outcome, including failures', () => {
    render(
      <ProvisioningReport
        steps={[
          { key: 'roles', title: 'Role ladder', status: 'done', detail: 'created 7 role(s)' },
          { key: 'metadata', title: 'CRM metadata', status: 'skipped', detail: '12 module(s) already present' },
          { key: 'sla', title: 'SLA policies', status: 'failed', detail: 'lock wait timeout' },
        ]}
      />,
    );
    expect(screen.getByText('Role ladder')).toBeInTheDocument();
    expect(screen.getByText('created 7 role(s)')).toBeInTheDocument();
    expect(screen.getByText('12 module(s) already present')).toBeInTheDocument();
    // A failure has to be legible, not swallowed — it is what "Finish setup" retries.
    expect(screen.getByText('lock wait timeout')).toBeInTheDocument();
  });

  it('renders nothing but an empty list when there were no steps', () => {
    const { container } = render(<ProvisioningReport steps={[]} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});

// ── The wizard, driven end to end against a mocked platform service ──────────

vi.mock('../src/services/platform.service', () => ({
  platformService: {
    getIndustries: vi.fn(async () => ({ data: [{ value: 'life_insurance', label: 'Life Insurance' }] })),
    getProvisioningSteps: vi.fn(async () => ({
      data: [
        { key: 'roles', title: 'Role ladder' },
        { key: 'org', title: 'Office and region' },
        { key: 'metadata', title: 'CRM metadata' },
        { key: 'dashboards', title: 'Dashboards' },
        { key: 'admin', title: 'First administrator' },
      ],
    })),
    checkTenantSlug: vi.fn(async (slug) => ({
      data: slug === 'taken-co'
        ? { slug, available: false, reason: 'Already in use', suggestion: 'taken-co-2' }
        : { slug, available: true },
    })),
    checkTenantAdmin: vi.fn(async () => ({ data: { employee_id: { available: true } } })),
    onboardTenant: vi.fn(async () => ({
      data: {
        tenant: { id: 7, name: 'Acme Life', slug: 'acme-life' },
        provisioning: { ok: true, steps: [{ key: 'roles', title: 'Role ladder', status: 'done', detail: 'created 7 role(s)' }] },
        readiness: { ready: true },
      },
    })),
  },
}));

const { platformService } = await import('../src/services/platform.service');
const { default: TenantOnboardWizard } = await import('../src/pages/platform/TenantOnboardWizard');

function renderWizard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TenantOnboardWizard open onClose={() => {}} onDone={() => {}} />
    </QueryClientProvider>,
  );
}

const typeName = (value) => fireEvent.change(screen.getByLabelText(/Organisation name/i), { target: { value } });

describe('TenantOnboardWizard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the workspace address from the name so nobody has to invent one', async () => {
    renderWizard();
    typeName('Acme Life');
    await waitFor(() => expect(screen.getByLabelText(/Workspace address/i)).toHaveValue('acme-life'));
  });

  it('holds Next back until the address is confirmed free', async () => {
    renderWizard();
    const next = () => screen.getByRole('button', { name: /Next/i });
    expect(next()).toBeDisabled();
    typeName('Acme Life');
    await waitFor(() => expect(next()).toBeEnabled());
  });

  it('offers the server suggestion when the address is taken', async () => {
    renderWizard();
    typeName('Taken Co');
    await waitFor(() => expect(screen.getByText(/Already in use/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /use taken-co-2/i }));
    await waitFor(() => expect(screen.getByLabelText(/Workspace address/i)).toHaveValue('taken-co-2'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled());
  });

  it('walks all three steps and submits one onboard call carrying the admin', async () => {
    renderWizard();
    typeName('Acme Life');
    await waitFor(() => expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 2 — required steps cannot be unticked, optional ones can.
    await waitFor(() => expect(screen.getByLabelText(/^Plan/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/CRM metadata/i)).toBeDisabled();
    expect(screen.getByLabelText(/Dashboards/i)).toBeEnabled();
    fireEvent.click(screen.getByLabelText(/Dashboards/i)); // opt out
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 3 — the id is suggested; fill in the rest.
    await waitFor(() => expect(screen.getByLabelText(/Employee ID/i)).toHaveValue('ACMELIFE_ADMIN'));
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));

    const submit = screen.getByRole('button', { name: /Create and set up/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(platformService.onboardTenant).toHaveBeenCalledTimes(1));
    const payload = platformService.onboardTenant.mock.calls[0][0];
    expect(payload).toMatchObject({
      name: 'Acme Life',
      slug: 'acme-life',
      plan: 'free',
      skip_steps: ['dashboards'],
    });
    expect(payload.admin).toMatchObject({ employee_id: 'ACMELIFE_ADMIN', employee_name: 'Ada Lovelace' });
    expect(payload.admin.password.length).toBeGreaterThanOrEqual(8);
  });

  it('shows the setup report and the credentials once, rather than a bare success toast', async () => {
    renderWizard();
    typeName('Acme Life');
    await waitFor(() => expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByLabelText(/^Plan/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByLabelText(/Employee ID/i)).toHaveValue('ACMELIFE_ADMIN'));
    fireEvent.change(screen.getByLabelText(/Full name/i), { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: /Create and set up/i })));

    await waitFor(() => expect(screen.getByText(/Workspace ready/i)).toBeInTheDocument());
    expect(screen.getByText('Role ladder')).toBeInTheDocument();
    expect(screen.getByText('created 7 role(s)')).toBeInTheDocument();
    expect(screen.getByText('ACMELIFE_ADMIN')).toBeInTheDocument();
    expect(screen.getByText(/Shown once/i)).toBeInTheDocument();
  });
});
