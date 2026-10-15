import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Clock, Lock, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';
import api from '../services/api';
import FieldRenderer from '../components/runtime/FieldRenderer';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import BrandLogo from '../components/ui/BrandLogo';
import { buildValidationRules } from '../utils/helpers';
import { useWorkspaceBranding } from '../hooks/useWorkspaceBranding';
import { useAppearanceStore } from '../store/appearanceStore';

/**
 * PublicFormPage — the hosted page for a published Builder form (/f/:key).
 *
 * Unauthenticated. Renders whatever fields the admin laid out, posts them with
 * the page's UTM tags and URL, and shows the thank-you message. Everything that
 * happens next (routing, acknowledgement, SLA) is configured in the Builder.
 * A website can embed this page in an iframe or post to the API directly.
 *
 * Presentation: the workspace's theme and logo, a brand panel beside the form,
 * two steps for longer forms ("your request", then "your details"), short
 * picklists as option cards, and a confirmation that shows what the CRM
 * computed (a calculator's instalment, a questionnaire's portfolio).
 */

// Fields that describe the person rather than the request.
const CONTACT_FIELDS = new Set([
  'first_name', 'last_name', 'full_name', 'email', 'mobile', 'phone', 'company', 'party_type',
  'preferred_language', 'country_of_residence', 'preferred_time', 'callback_time',
]);
const STEP_THRESHOLD = 7;      // forms with this many fields or more get two steps
const CARD_OPTIONS_MAX = 6;    // picklists this short render as option cards
const WIDE_TYPES = ['textarea', 'rich_text', 'heading', 'divider'];

const optValue = (o) => String(o?.value ?? o);
const optLabel = (o) => String(o?.label ?? o?.value ?? o);

/** Present a computed result (an instalment, a rate, a portfolio name). */
export function formatResult(value, meta = {}) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n) || typeof value === 'boolean') return String(value).replace(/_/g, ' ');
  const digits = meta.precision ?? (Math.abs(n) >= 100 ? 0 : 2);
  const text = n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = meta.format === 'percent' || meta.format === 'percentage' || /%/.test(meta.label ?? '');
  return pct ? `${text}%` : text;
}

function OptionCards({ field, register, rules, error }) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
        {field.label}{field.required && <span className="ml-0.5 text-red-500">*</span>}
      </legend>
      <div className={clsx('grid gap-2', field.options.length > 3 ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {field.options.map((o) => (
          <label key={optValue(o)} className="group relative cursor-pointer">
            <input type="radio" value={optValue(o)} className="peer sr-only" {...register(field.name, rules)} />
            <span className="flex h-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 transition
              hover:border-primary-300 hover:bg-primary-50/40
              peer-checked:border-primary-500 peer-checked:bg-primary-50 peer-checked:text-primary-800 peer-checked:ring-2 peer-checked:ring-primary-500/20
              peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40
              dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:peer-checked:bg-primary-500/15 dark:peer-checked:text-primary-200">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-300 dark:border-white/20" aria-hidden="true">
                <span className="h-2 w-2 scale-0 rounded-full bg-primary-600 transition group-has-[:checked]:scale-100" />
              </span>
              {optLabel(o)}
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error.message || 'Please choose an option'}</p>}
    </fieldset>
  );
}

function SelectField({ field, register, rules, error }) {
  const id = `f-${field.name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
        {field.label}{field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="relative">
        <select id={id} {...register(field.name, rules)}
          className={clsx('form-input w-full appearance-none pr-9', error && 'border-red-400 focus:ring-red-500/30')}>
          {/* Not `disabled`: a disabled placeholder makes the browser pick the first real option silently. */}
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
      </div>
      {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error.message || 'This field is required'}</p>}
    </div>
  );
}

function ConsentField({ field, register, error }) {
  return (
    <div>
      <label className={clsx('flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition',
        error ? 'border-red-300 bg-red-50/60 dark:bg-red-500/10' : 'border-gray-200 bg-gray-50/70 hover:border-primary-300 dark:border-white/10 dark:bg-white/5')}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          {...register(field.name, { required: 'Please tick this box so we can contact you' })} />
        <span className="text-gray-700 dark:text-white/80">{field.label}</span>
      </label>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error.message}</p>}
    </div>
  );
}

function Field({ field, form, consentField }) {
  const { register, control, formState: { errors }, watch } = form;
  const rules = buildValidationRules({ ...field, field_type: field.type, is_required: field.required, label: field.label });
  const error = errors[field.name];
  const opts = Array.isArray(field.options) ? field.options : [];
  if (field.name === consentField && field.type === 'checkbox') return <ConsentField field={field} register={register} error={error} />;
  if (['select', 'radio'].includes(field.type) && opts.length > 0) {
    return opts.length <= CARD_OPTIONS_MAX
      ? <OptionCards field={{ ...field, options: opts }} register={register} rules={rules} error={error} />
      : <SelectField field={{ ...field, options: opts }} register={register} rules={rules} error={error} />;
  }
  // A public page has no currency profile, so a currency field would show the
  // default "$" whatever the currency picked next to it: show a plain amount.
  const type = field.type === 'currency' ? 'number' : field.type;
  return (
    <FieldRenderer
      field={{ ...field, field_type: type, is_required: field.required, help_text: field.help }}
      register={register}
      control={control}
      errors={errors}
      validationRules={rules}
      watchValue={watch(field.name)}
    />
  );
}

function BrandPanel({ form, productLabel }) {
  const appearance = useAppearanceStore((s) => s.current);
  const points = [
    { icon: Lock, text: 'Your details are sent securely and used only to answer you.' },
    { icon: Clock, text: 'A specialist gets back to you quickly, in your language.' },
    { icon: Sparkles, text: 'No obligation — ask anything.' },
  ];
  return (
    <aside className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-mid-600 to-accent-600 px-6 py-8 text-white sm:px-10 lg:min-h-screen lg:py-14">
      {/* soft light shapes */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto flex h-full max-w-md flex-col">
        {/* The client sees the workspace, not the product it runs on. */}
        <div className="flex items-center gap-3">
          <BrandLogo size="lg" onDark appearance={appearance} showName={false} />
          {form.workspace && <span className="font-display text-lg font-semibold">{form.workspace}</span>}
        </div>
        <div className="mt-8 lg:mt-16">
          <h1 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{form.title}</h1>
          {form.description && <p className="mt-3 text-base text-white/80">{form.description}</p>}
          {form.expert && (
            <p className="mt-5 mr-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
              <UserRound className="h-3.5 w-3.5" /> You&apos;ll speak with {form.expert.name}
            </p>
          )}
          {productLabel && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm backdrop-blur">
              <Check className="h-3.5 w-3.5" /> {productLabel}
            </p>
          )}
        </div>
        <ul className="mt-8 hidden space-y-4 lg:block">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-white/85">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icon className="h-4 w-4" /></span>
              <span className="pt-1.5">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-auto hidden pt-10 text-xs text-white/60 lg:block">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-text-bottom" /> Protected against spam. We never share your details.
        </p>
      </div>
    </aside>
  );
}

function Confirmation({ done, onAgain }) {
  const results = done.results ? Object.entries(done.results).filter(([, v]) => v != null && v !== '') : [];
  const meta = Object.fromEntries((done.result_fields ?? []).map((m) => [m.name, m]));
  return (
    <div className="flex flex-col items-center py-6 text-center motion-safe:animate-fade-in">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60 dark:bg-emerald-500/15 dark:ring-emerald-500/10">
        <CheckCircle2 className="h-9 w-9 text-emerald-500" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">Thank you</h2>
      <p className="mt-2 max-w-md text-gray-600 dark:text-white/70">{done.message}</p>
      {results.length > 0 && (
        <div className={clsx('mt-6 grid w-full gap-3', results.length > 1 && 'sm:grid-cols-2')}>
          {results.map(([name, value]) => (
            <div key={name} className="rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-4 text-left dark:border-white/10 dark:from-primary-500/10 dark:to-transparent">
              <p className="text-xs font-medium uppercase tracking-wide text-primary-700 dark:text-primary-300">{meta[name]?.label ?? name.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-2xl font-semibold capitalize text-gray-900 dark:text-white">{formatResult(value, meta[name])}</p>
            </div>
          ))}
        </div>
      )}
      {done.reference && (
        <p className="mt-6 rounded-full bg-gray-100 px-4 py-1.5 text-sm text-gray-600 dark:bg-white/10 dark:text-white/70">
          Your reference: <strong className="font-mono text-gray-900 dark:text-white">{done.reference}</strong>
        </p>
      )}
      <button type="button" onClick={onAgain} className="mt-6 text-sm font-medium text-primary-600 hover:underline">Send another request</button>
    </div>
  );
}

export default function PublicFormPage() {
  const { key } = useParams();
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, done: null });
  const [step, setStep] = useState(0);
  useWorkspaceBranding(form?.tenant_id);
  const rhf = useForm({ mode: 'onTouched' });
  const { handleSubmit, formState: { isSubmitting }, trigger, setValue, reset } = rhf;

  // `?prod=` pre-selects a product on the website's "Request more info" links.
  const prod = useMemo(() => new URLSearchParams(window.location.search).get('prod'), []);
  // `?expert=` — a "Talk to …" link: the request goes to that person.
  const expert = useMemo(() => new URLSearchParams(window.location.search).get('expert'), []);

  useEffect(() => {
    let alive = true;
    api.get(`/public/forms/${key}`, { params: expert ? { expert } : {} })
      .then((r) => { if (alive) { setForm(r.data?.data ?? r.data); setState({ loading: false, error: null, done: null }); } })
      .catch(() => { if (alive) setState({ loading: false, error: 'This form is not available.', done: null }); });
    return () => { alive = false; };
  }, [key, expert]);

  const productField = form?.fields.find((f) => f.name === 'product_code');
  const productOption = prod && productField?.options?.find((o) => optValue(o) === prod);
  // Start from the Builder defaults (currency MUR, language English…) and the `?prod=` product.
  const defaults = useMemo(() => {
    if (!form) return {};
    const d = Object.fromEntries(form.fields.filter((f) => f.default != null && f.default !== '').map((f) => [f.name, String(f.default)]));
    if (productOption) d.product_code = optValue(productOption);
    return d;
  }, [form, productOption]);
  useEffect(() => { for (const [k, v] of Object.entries(defaults)) setValue(k, v); }, [defaults, setValue]);

  // Longer forms: the request first, then who is asking.
  const steps = useMemo(() => {
    if (!form) return [];
    const request = form.fields.filter((f) => !CONTACT_FIELDS.has(f.name) && f.name !== form.consent_field);
    const contact = form.fields.filter((f) => CONTACT_FIELDS.has(f.name) || f.name === form.consent_field);
    if (form.fields.length < STEP_THRESHOLD || !request.length || !contact.length) return [{ title: null, fields: form.fields }];
    return [{ title: 'Your needs', fields: request }, { title: 'Your details', fields: contact }];
  }, [form]);

  const onSubmit = async ({ _hp, ...values }) => {
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith('utm_')));
    const data = { ...values };
    if (prod && productField && !data.product_code) data.product_code = prod;
    try {
      const r = await api.post(`/public/forms/${key}`, {
        data, utm, page_url: document.referrer || window.location.href, language: navigator.language?.slice(0, 2),
        ...(_hp ? { _hp } : {}),
        ...(form.expert ? { expert: form.expert.id } : {}),
      });
      setState({ loading: false, error: null, done: r.data?.data ?? r.data });
    } catch (err) {
      setState((s) => ({ ...s, error: err?.response?.data?.error?.message || 'Something went wrong. Please try again.' }));
    }
  };

  const next = async () => {
    if (await trigger(steps[step].fields.map((f) => f.name))) setStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const again = () => { reset(defaults); setStep(0); setState({ loading: false, error: null, done: null }); };

  if (state.loading) return <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-night-1"><Spinner /></div>;
  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-gray-500 dark:bg-night-1">
        <AlertCircle className="mr-2 h-5 w-5" /> {state.error}
      </div>
    );
  }

  const current = steps[step];
  const last = step === steps.length - 1;
  const multi = steps.length > 1;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-1 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <BrandPanel form={form} productLabel={productOption ? optLabel(productOption) : null} />
      <main className="px-4 py-8 sm:px-8 lg:flex lg:items-center lg:py-14">
        <div className="mx-auto w-full max-w-xl">
          <div className="rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/60 ring-1 ring-black/5 sm:p-8 dark:bg-night-2 dark:shadow-none dark:ring-white/10">
            {state.done ? <Confirmation done={state.done} onAgain={again} /> : (
              <form onSubmit={handleSubmit(onSubmit)} noValidate aria-describedby={state.error ? 'form-error' : undefined}>
                {multi && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-white/50">
                      <span>Step {step + 1} of {steps.length}</span>
                      <span className="text-gray-900 dark:text-white">{current.title}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-500"
                        style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
                    </div>
                  </div>
                )}
                {!multi && <h2 className="mb-5 text-lg font-semibold text-gray-900 dark:text-white">Tell us about your request</h2>}

                {/* One label style for every control (the shared renderer varies by type). */}
                <div key={step} className={clsx('grid gap-5 motion-safe:animate-fade-in',
                  '[&_label]:text-sm [&_label]:font-medium [&_label]:normal-case [&_label]:tracking-normal [&_label]:text-gray-700 dark:[&_label]:text-white/80',
                  form.columns > 1 && 'sm:grid-cols-2')}>
                  {current.fields.map((f) => {
                    const wide = f.col_span > 1 || WIDE_TYPES.includes(f.type) || f.name === form.consent_field
                      || (['select', 'radio'].includes(f.type) && (f.options?.length ?? 0) > 0 && f.options.length <= CARD_OPTIONS_MAX);
                    return (
                      <div key={f.name} className={wide ? 'sm:col-span-2' : ''}>
                        <Field field={f} form={rhf} consentField={form.consent_field} />
                      </div>
                    );
                  })}
                </div>

                {/* Honeypot: invisible to people, irresistible to bots. */}
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...rhf.register('_hp')} />
                {state.error && <p id="form-error" role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{state.error}</p>}

                <div className="mt-7 flex items-center justify-between gap-3">
                  {multi && step > 0
                    ? <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
                    : <span />}
                  {last
                    ? <Button type="submit" loading={isSubmitting} className="min-w-[10rem]">Send request<ArrowRight className="ml-1 h-4 w-4" /></Button>
                    : <Button type="button" onClick={next} className="min-w-[10rem]">Continue<ArrowRight className="ml-1 h-4 w-4" /></Button>}
                </div>
              </form>
            )}
          </div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-white/40">
            <Lock className="h-3 w-3" /> Secure form{form.workspace ? ` · ${form.workspace}` : ''}
          </p>
        </div>
      </main>
    </div>
  );
}
