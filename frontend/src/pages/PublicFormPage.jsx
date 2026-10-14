import { useEffect, useState } from 'react';
import { useWorkspaceBranding } from '../hooks/useWorkspaceBranding';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';
import FieldRenderer from '../components/runtime/FieldRenderer';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { buildValidationRules } from '../utils/helpers';

/**
 * PublicFormPage — the hosted page for a published Builder form (/f/:key).
 *
 * Unauthenticated. Renders whatever fields the admin laid out, posts them with
 * the page's UTM tags and URL, and shows the thank-you message. Everything that
 * happens next (routing, acknowledgement, SLA) is configured in the Builder.
 * A website can embed this page in an iframe or post to the API directly.
 */
export default function PublicFormPage() {
  const { key } = useParams();
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ loading: true, error: null, done: null });
  useWorkspaceBranding(form?.tenant_id);
  const { register, control, handleSubmit, formState: { errors, isSubmitting }, watch } = useForm();

  useEffect(() => {
    let alive = true;
    api.get(`/public/forms/${key}`)
      .then((r) => { if (alive) { setForm(r.data?.data ?? r.data); setState({ loading: false, error: null, done: null }); } })
      .catch(() => { if (alive) setState({ loading: false, error: 'This form is not available.', done: null }); });
    return () => { alive = false; };
  }, [key]);

  const onSubmit = async ({ _hp, ...values }) => {
    const params = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith('utm_')));
    // `?prod=` pre-selects a product on the website's "Request more info" links.
    const data = { ...values };
    if (params.get('prod') && form.fields.some((f) => f.name === 'product_code') && !data.product_code) data.product_code = params.get('prod');
    try {
      const r = await api.post(`/public/forms/${key}`, {
        data, utm, page_url: document.referrer || window.location.href, language: navigator.language?.slice(0, 2),
        ...(_hp ? { _hp } : {}),
      });
      setState({ loading: false, error: null, done: r.data?.data ?? r.data });
    } catch (err) {
      setState((s) => ({ ...s, error: err?.response?.data?.error?.message || 'Something went wrong. Please try again.' }));
    }
  };

  if (state.loading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (!form) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-gray-500">
        <AlertCircle className="mr-2 h-5 w-5" /> {state.error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-night-1">
      <div className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-night-2 dark:ring-white/10">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{form.title}</h1>
        {form.description && <p className="mt-1 text-sm text-gray-500">{form.description}</p>}
        {state.done ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-gray-800 dark:text-white/90">{state.done.message}</p>
            {state.done.reference && <p className="text-sm text-gray-500">Reference: <strong>{state.done.reference}</strong></p>}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <div className={form.columns > 1 ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
              {form.fields.map((f) => (
                <div key={f.name} className={f.col_span > 1 || ['textarea', 'rich_text', 'heading', 'divider'].includes(f.type) ? 'sm:col-span-2' : ''}>
                  <FieldRenderer
                    field={{ ...f, field_type: f.type, is_required: f.required, help_text: f.help }}
                    register={register}
                    control={control}
                    errors={errors}
                    validationRules={buildValidationRules({ ...f, field_type: f.type, is_required: f.required, label: f.label })}
                    watchValue={watch(f.name)}
                  />
                </div>
              ))}
            </div>
            {/* Honeypot: invisible to people, irresistible to bots. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" {...register('_hp')} />
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">Submit</Button>
          </form>
        )}
      </div>
    </div>
  );
}
