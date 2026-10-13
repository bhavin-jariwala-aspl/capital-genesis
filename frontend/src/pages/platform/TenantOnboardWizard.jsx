import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Building2, Check, ChevronLeft, ChevronRight, Copy, Dices, Eye, EyeOff,
  Loader2, ShieldCheck, Sparkles, TriangleAlert, X,
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import { platformService } from '../../services/platform.service';
import { showError, showSuccess } from '../../utils/dialog';

/**
 * Tenant onboarding wizard.
 *
 * Replaces a two-modal flow that asked a platform admin to type a URL slug and
 * an employee ID by hand, submit, read a 409 off a toast, and then find the row
 * again to add an administrator. Neither modal told them that a tenant created
 * this way had no roles, no modules and no dashboards — so the workspace they
 * handed over was empty, and the admin they created signed in with broken
 * authority.
 *
 * Three steps, each answering one question, with the fiddly parts done for the
 * operator rather than demanded of them:
 *
 *   1. Organisation — name, with the slug derived and checked as they type.
 *   2. Plan & contents — plan, industry, and which setup steps to run.
 *   3. Administrator — id suggested from the workspace name, password generated.
 *
 * Submitting is a single `POST /platform/tenants/onboard`. The result is a
 * per-step report, shown as a checklist rather than a spinner that ends in
 * "Created": the admin sees what was installed, and a step that failed is named
 * so "Finish setup" can retry just that one.
 */

const PLAN_OPTIONS = [
  { value: 'free',         label: 'Free — 5 users, evaluation' },
  { value: 'starter',      label: 'Starter — small team, 14-day trial' },
  { value: 'professional', label: 'Professional — growing agency' },
  { value: 'enterprise',   label: 'Enterprise — unlimited, custom terms' },
];

/** Steps the admin can opt out of. The rest are what makes a tenant work. */
const OPTIONAL_STEPS = new Set(['dashboards', 'sla', 'email_templates', 'workflows']);

/** Mirrors `slugify` in backend/src/services/platform/tenant.service.js. */
export function slugify(name) {
  return String(name)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/, '');
}

/** An employee ID seeded from the workspace name, e.g. "Acme Life" → "ACME_ADMIN". */
export function suggestEmployeeId(name) {
  const stem = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return stem ? `${stem}_ADMIN`.slice(0, 20) : '';
}

/**
 * A password strong enough that nobody is tempted to invent "Welcome@123".
 * Ambiguous glyphs are left out so it survives being read aloud or retyped.
 */
export function generatePassword(length = 18) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';
  const bytes = new Uint32Array(length);
  (globalThis.crypto ?? window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Rough strength read-out, purely to discourage the obviously weak. */
export function passwordStrength(value) {
  const pw = String(value ?? '');
  if (!pw) return { score: 0, label: 'Enter a password', tone: 'text-gray-400' };
  if (pw.length < 8) return { score: 1, label: 'Too short — 8 characters minimum', tone: 'text-red-500' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  const score = Math.min(4, (pw.length >= 16 ? 2 : pw.length >= 12 ? 1 : 0) + classes - 1);
  return [
    { score: 1, label: 'Weak', tone: 'text-red-500' },
    { score: 2, label: 'Fair', tone: 'text-amber-500' },
    { score: 3, label: 'Good', tone: 'text-emerald-600' },
    { score: 4, label: 'Strong', tone: 'text-emerald-600' },
  ][Math.max(0, score - 1)] ?? { score: 1, label: 'Weak', tone: 'text-red-500' };
}

/** Debounce a value so availability checks follow typing, not keystrokes. */
function useDebounced(value, ms = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** A tick / cross / spinner next to a field the server is vetting. */
function Availability({ state }) {
  if (!state) return null;
  if (state.checking) return <span className="flex items-center gap-1 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>;
  if (state.available) return <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Available</span>;
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-red-500">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
      {state.reason ?? 'Not available'}
      {state.suggestion && (
        <button type="button" onClick={state.onUseSuggestion}
          className="ml-1 rounded-md bg-red-50 px-1.5 py-0.5 font-mono font-medium text-red-600 underline-offset-2 hover:underline dark:bg-red-500/15 dark:text-red-300">
          use {state.suggestion}
        </button>
      )}
    </span>
  );
}

const STEP_ICON = {
  done:    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
  skipped: <ChevronRight className="h-3.5 w-3.5 text-gray-400" />,
  failed:  <X className="h-3.5 w-3.5 text-red-500" />,
};

/** The per-step outcome list shown once provisioning has run. */
export function ProvisioningReport({ steps }) {
  return (
    <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
      {steps.map((s) => (
        <li key={s.key} className="flex items-start gap-2.5 py-2">
          <span className="mt-0.5 shrink-0">{STEP_ICON[s.status] ?? STEP_ICON.skipped}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{s.title}</span>
            {s.detail && (
              <span className={`block break-words text-xs ${s.status === 'failed' ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {s.detail}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const BLANK = {
  name: '', slug: '', slugEdited: false, billing_email: '', domain: '',
  plan: 'free', industry: 'other', timezone: 'UTC', locale: 'en',
  admin_employee_id: '', adminIdEdited: false, admin_employee_name: '', admin_email: '', admin_password: '',
  skip: [],
};

export default function TenantOnboardWizard({ open, onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(BLANK);
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState(null);
  const nameRef = useRef(null);

  const set = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  // Reset on each open so a previous run's report never bleeds into a new one.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm(BLANK);
    setResult(null);
    setShowPassword(false);
  }, [open]);

  const { data: industriesRes } = useQuery({
    queryKey: ['platform-industries'],
    queryFn: () => platformService.getIndustries(),
    staleTime: 60 * 60_000,
    enabled: open,
  });
  const industries = useMemo(() => {
    const raw = industriesRes?.data ?? [];
    return raw.map((i) => (typeof i === 'string'
      ? { value: i, label: i.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
      : { value: i.value ?? i.name, label: i.label ?? i.name }));
  }, [industriesRes]);

  const { data: stepsRes } = useQuery({
    queryKey: ['platform-provisioning-steps'],
    queryFn: () => platformService.getProvisioningSteps(),
    staleTime: 60 * 60_000,
    enabled: open,
  });
  // `admin` is driven by the form below, not by a checkbox.
  const catalogue = (stepsRes?.data ?? []).filter((s) => s.key !== 'admin');

  // ── Derived identifiers: typed for the operator until they override ──────
  const slug = form.slugEdited ? form.slug : slugify(form.name);
  const adminId = form.adminIdEdited ? form.admin_employee_id : suggestEmployeeId(form.name);

  // ── Live availability ───────────────────────────────────────────────────
  const debouncedSlug = useDebounced(slug);
  const slugQuery = useQuery({
    queryKey: ['platform-check-slug', debouncedSlug],
    queryFn: () => platformService.checkTenantSlug(debouncedSlug),
    enabled: open && debouncedSlug.length >= 3,
    staleTime: 15_000,
    retry: false,
  });

  const debouncedAdminId = useDebounced(adminId);
  const debouncedAdminEmail = useDebounced(form.admin_email);
  const adminQuery = useQuery({
    queryKey: ['platform-check-admin', debouncedAdminId, debouncedAdminEmail, slug],
    queryFn: () => platformService.checkTenantAdmin({
      employee_id: debouncedAdminId || undefined,
      email: debouncedAdminEmail || undefined,
      slug: slug || undefined,
    }),
    enabled: open && step === 2 && Boolean(debouncedAdminId || debouncedAdminEmail),
    staleTime: 15_000,
    retry: false,
  });

  const slugState = slug.length < 3
    ? null
    : slugQuery.isFetching
      ? { checking: true }
      : {
          ...(slugQuery.data?.data ?? {}),
          onUseSuggestion: () => set({ slug: slugQuery.data?.data?.suggestion ?? '', slugEdited: true }),
        };

  const adminIdState = !adminId
    ? null
    : adminQuery.isFetching
      ? { checking: true }
      : {
          ...(adminQuery.data?.data?.employee_id ?? {}),
          onUseSuggestion: () => set({ admin_employee_id: adminQuery.data?.data?.employee_id?.suggestion ?? '', adminIdEdited: true }),
        };

  const adminEmailState = !form.admin_email
    ? null
    : adminQuery.isFetching
      ? { checking: true }
      : (adminQuery.data?.data?.email ?? null);

  const strength = passwordStrength(form.admin_password);

  // ── Per-step validity, so "Next" is honest about what is missing ─────────
  const stepValid = [
    form.name.trim().length >= 2 && slug.length >= 3 && slugState?.available === true,
    Boolean(form.plan),
    /^[A-Z0-9_]{3,20}$/.test(adminId)
      && form.admin_employee_name.trim().length >= 2
      && form.admin_password.length >= 8
      && adminIdState?.available !== false
      && adminEmailState?.available !== false,
  ];

  const onboard = useMutation({
    mutationFn: () => platformService.onboardTenant({
      name: form.name.trim(),
      slug,
      ...(form.domain ? { domain: form.domain.trim() } : {}),
      ...(form.billing_email ? { billing_email: form.billing_email.trim() } : {}),
      plan: form.plan,
      industry: form.industry || undefined,
      timezone: form.timezone,
      locale: form.locale,
      skip_steps: form.skip,
      admin: {
        employee_id: adminId,
        employee_name: form.admin_employee_name.trim(),
        email: form.admin_email.trim() || undefined,
        password: form.admin_password,
      },
    }),
    onSuccess: (res) => {
      setResult(res?.data ?? null);
      setStep(3);
      onDone?.();
    },
    onError: (e) => showError(e?.response?.data?.error?.message || e?.message || 'Could not create the workspace'),
  });

  const copyCredentials = async () => {
    const lines = [
      `Workspace: ${form.name.trim()} (${slug})`,
      `Employee ID: ${adminId}`,
      `Password: ${form.admin_password}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      showSuccess('Sign-in details copied to the clipboard');
    } catch {
      showError('Could not reach the clipboard — copy the details from this screen instead');
    }
  };

  const titles = ['Organisation', 'Plan and contents', 'Administrator', 'Setup report'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={step === 3 ? ShieldCheck : Building2}
      eyebrow="Platform"
      title={step === 3 ? 'Workspace ready' : 'New workspace'}
      subtitle={step === 3
        ? 'What was installed, and the details to hand over.'
        : `Step ${step + 1} of 3 — ${titles[step]}`}
      footer={step === 3 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={copyCredentials}><Copy className="h-4 w-4" /> Copy sign-in details</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            <ChevronLeft className="h-4 w-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!stepValid[step]}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => onboard.mutate()} disabled={!stepValid[2]} loading={onboard.isPending}>
              {!onboard.isPending && <Sparkles className="h-4 w-4" />}
              {onboard.isPending ? 'Setting up\u2026' : 'Create and set up'}
            </Button>
          )}
        </div>
      )}
    >
      {/* Progress rail */}
      {step < 3 && (
        <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
          {titles.slice(0, 3).map((t, i) => (
            <li key={t} className="flex flex-1 items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < step ? 'bg-emerald-500 text-white'
                  : i === step ? 'bg-primary-600 text-on-primary'
                    : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-500'}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`hidden truncate text-xs sm:block ${i === step ? 'font-semibold text-gray-800 dark:text-gray-200' : 'text-gray-400'}`}>{t}</span>
              {i < 2 && <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />}
            </li>
          ))}
        </ol>
      )}

      {/* ── Step 1: who is this workspace for ─────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4">
          <Input
            ref={nameRef} label="Organisation name" required autoFocus
            placeholder="Acme Corporation"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            help="The name your customer sees throughout the product."
          />
          <div>
            <Input
              label="Workspace address" required
              prefix="/" value={slug}
              onChange={(e) => set({ slug: slugify(e.target.value), slugEdited: true })}
              help="Used in URLs and branding asset paths, and fixed once the workspace exists."
            />
            <div className="mt-1.5"><Availability state={slugState} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Billing email" type="email" placeholder="billing@acme.test"
              value={form.billing_email}
              onChange={(e) => set({ billing_email: e.target.value })}
            />
            <Input
              label="Custom domain" placeholder="crm.acme.test"
              value={form.domain}
              onChange={(e) => set({ domain: e.target.value })}
              help="Optional."
            />
          </div>
        </div>
      )}

      {/* ── Step 2: what they get ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <Select
            label="Plan" required options={PLAN_OPTIONS}
            value={form.plan} onChange={(e) => set({ plan: e.target.value })}
            help="User, storage and API limits come from the plan. Paid plans start on a trial."
          />
          <Select
            label="Industry" options={industries} placeholder="Not specified"
            value={form.industry} onChange={(e) => set({ industry: e.target.value })}
            help="Selects the email-template pack installed with the workspace."
          />

          <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Install with the workspace
            </legend>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Everything here is re-runnable later from the workspace&rsquo;s setup checklist.
              The metadata, role ladder and office cannot be skipped — without them nobody can sign in and use the product.
            </p>
            <ul className="space-y-2">
              {catalogue.map((s) => {
                const optional = OPTIONAL_STEPS.has(s.key);
                const skipped = form.skip.includes(s.key);
                return (
                  <li key={s.key} className="flex items-center gap-2.5">
                    <input
                      id={`step-${s.key}`} type="checkbox" disabled={!optional} checked={!skipped}
                      onChange={(e) => set({
                        skip: e.target.checked ? form.skip.filter((k) => k !== s.key) : [...form.skip, s.key],
                      })}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50 dark:border-white/20 dark:bg-white/5"
                    />
                    <label htmlFor={`step-${s.key}`} className="text-sm text-gray-700 dark:text-gray-300">
                      {s.title}
                      {!optional && <span className="ml-2 text-xs text-gray-400">required</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>
      )}

      {/* ── Step 3: who runs it ───────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="rounded-xl bg-primary-50/60 p-3 text-xs text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
            This account is created as <strong>Super Administrator</strong> of the new workspace — the
            most senior role inside it. It carries no access to this platform console or to any other
            workspace.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="Employee ID" required autoFocus value={adminId}
                onChange={(e) => set({ admin_employee_id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''), adminIdEdited: true })}
                help="How they sign in. Unique across the whole platform."
              />
              <div className="mt-1.5"><Availability state={adminIdState} /></div>
            </div>
            <Input
              label="Full name" required placeholder="Ada Lovelace"
              value={form.admin_employee_name}
              onChange={(e) => set({ admin_employee_name: e.target.value })}
            />
          </div>
          <div>
            <Input
              label="Email" type="email" placeholder="ada@acme.test"
              value={form.admin_email}
              onChange={(e) => set({ admin_email: e.target.value })}
              help="Needed for password resets and notifications."
            />
            <div className="mt-1.5"><Availability state={adminEmailState} /></div>
          </div>
          <div>
            <div className="flex items-end gap-2">
              <Input
                wrapperClass="flex-1" label="Temporary password" required
                type={showPassword ? 'text' : 'password'}
                value={form.admin_password}
                onChange={(e) => set({ admin_password: e.target.value })}
              />
              <Button variant="outline" size="icon" onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="outline"
                onClick={() => { set({ admin_password: generatePassword() }); setShowPassword(true); }}>
                <Dices className="h-4 w-4" /> Generate
              </Button>
            </div>
            <p className={`mt-1.5 text-xs ${strength.tone}`}>{strength.label}</p>
          </div>
        </div>
      )}

      {/* ── Report ────────────────────────────────────────────────────── */}
      {step === 3 && result && (
        <div className="space-y-5">
          {!result.provisioning?.ok && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              The workspace exists, but some setup steps did not complete. Use
              <strong className="mx-1">Finish setup</strong>
              on its row to retry only what is still missing.
            </p>
          )}

          <div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Hand these over
            </h3>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Workspace</dt>
              <dd className="font-medium text-gray-900 dark:text-white">{result.tenant?.name} <span className="text-gray-400">/{result.tenant?.slug}</span></dd>
              <dt className="text-gray-500 dark:text-gray-400">Employee ID</dt>
              <dd className="font-mono font-medium text-gray-900 dark:text-white">{adminId}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Password</dt>
              <dd className="break-all font-mono font-medium text-gray-900 dark:text-white">{form.admin_password}</dd>
            </dl>
            <p className="mt-2 text-xs text-gray-400">
              Shown once. Ask them to change it after their first sign-in.
            </p>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Setup report
            </h3>
            <ProvisioningReport steps={result.provisioning?.steps ?? []} />
          </div>
        </div>
      )}
    </Modal>
  );
}
