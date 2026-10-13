import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Plus, Upload, FileText, MessageSquare, ShieldCheck, Download, Send, User } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import FieldValue from '../../components/runtime/FieldValue';
import { portalClient, portalToken } from '../../services/portal.service';
import { fmtDate, fmtCurrency } from '../../utils/formatters';

/**
 * Client & introducer portal (/portal/:slug) — PRD M23 / M19.
 *
 * Its own sign-in realm (one-time code by email) and its own token. Every
 * section is metadata: objects whose `config.portal` exposes them, showing the
 * signed-in client's own records, with create forms and document uploads where
 * the Builder allows them.
 */
const errText = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? e?.message ?? 'Something went wrong';

function SignIn({ slug, api, workspace, onSignedIn }) {
  const [realm, setRealm] = useState('client');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [devCode, setDevCode] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const request = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.requestCode(realm, email);
      setDevCode(r?.dev_code ?? null);
      setStep('code');
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.verifyCode(realm, email, code);
      portalToken.set(slug, r.token);
      onSignedIn();
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-night-2">
        <div className="mb-5 flex items-center gap-3">
          {workspace?.logo_url ? <img src={workspace.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain" /> : <ShieldCheck className="h-8 w-8 text-primary-600" />}
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{workspace?.name ?? 'Client portal'}</h1>
            <p className="text-xs text-gray-500 dark:text-white/50">Secure sign-in</p>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 text-sm dark:bg-white/5">
          {[['client', 'Client'], ['introducer', 'Introducer']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setRealm(v); setStep('email'); }}
              className={`rounded-md py-1.5 font-medium ${realm === v ? 'bg-white text-primary-700 shadow-sm dark:bg-night-3 dark:text-primary-300' : 'text-gray-500 dark:text-white/50'}`}>{l}</button>
          ))}
        </div>
        {step === 'email' ? (
          <form onSubmit={request} className="space-y-4">
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="the email we have on file" autoFocus />
            <Button type="submit" loading={busy} className="w-full">Send me a sign-in code</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-white/60">If <strong>{email}</strong> is registered, we have emailed a 6-digit code. It expires in 10 minutes.</p>
            {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Demo environment (no mail server): your code is <strong className="font-mono">{devCode}</strong></p>}
            <Input label="Sign-in code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            <Button type="submit" loading={busy} className="w-full">Sign in</Button>
            <button type="button" onClick={() => setStep('email')} className="w-full text-xs text-gray-500 hover:underline">Use a different email</button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function CreateForm({ api, view, onDone }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const lookupFields = view.create.fields.filter((f) => f.field_type === 'lookup');
  const options = useQuery({
    queryKey: ['portal-options', view.object],
    queryFn: async () => Object.fromEntries(await Promise.all(lookupFields.map(async (f) => [f.name, await api.options(view.object, f.name)]))),
    enabled: lookupFields.length > 0,
  });
  const save = useMutation({
    mutationFn: () => api.create(view.object, values),
    onSuccess: onDone,
    onError: (e) => setError(errText(e)),
  });
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }} className="space-y-3">
      {view.create.fields.map((f) => {
        if (f.field_type === 'lookup') {
          return <Select key={f.name} label={f.label} value={values[f.name] ?? ''} onChange={(e) => set(f.name, Number(e.target.value) || '')} options={[{ value: '', label: 'Select…' }, ...(options.data?.[f.name] ?? [])]} />;
        }
        if (['select', 'radio'].includes(f.field_type)) {
          return <Select key={f.name} label={f.label} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} options={[{ value: '', label: 'Select…' }, ...(f.options ?? [])]} />;
        }
        if (f.field_type === 'checkbox') {
          return (
            <label key={f.name} className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/80">
              <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}
            </label>
          );
        }
        if (f.field_type === 'textarea') {
          return (
            <label key={f.name} className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700 dark:text-white/80">{f.label}</span>
              <textarea className="form-input min-h-[90px]" value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
            </label>
          );
        }
        const numeric = ['currency', 'decimal', 'integer', 'number', 'percent'].includes(f.field_type);
        return <Input key={f.name} label={f.label} type={numeric ? 'number' : f.field_type === 'email' ? 'email' : 'text'} value={values[f.name] ?? ''} onChange={(e) => set(f.name, numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />;
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Submit</Button></div>
    </form>
  );
}

function UploadButton({ api, recordId, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await api.upload(recordId, { filename: file.name, mime_type: file.type, data });
      onDone?.();
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  };
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary-600 hover:underline" title="Upload a PDF, JPEG or PNG">
      {busy ? <Spinner size="sm" /> : <Upload className="h-3 w-3" />} Upload
      <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={onFile} />
      {error && <span className="ml-1 text-red-600">{error}</span>}
    </label>
  );
}

function Section({ api, view, onChanged }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['portal-list', view.object], queryFn: () => api.list(view.object) });
  const rows = data?.records ?? [];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-night-2">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{view.title}</h2>
        {view.create && <Button size="xs" onClick={() => setCreating(true)}><Plus className="mr-1 h-3 w-3" />{view.create.label}</Button>}
      </header>
      {isLoading ? <Spinner /> : error ? <p className="text-sm text-red-600">{errText(error)}</p> : rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                {view.fields.map((f) => <th key={f.name} className="px-2 py-1.5 font-medium">{f.label}</th>)}
                <th className="px-2 py-1.5 font-medium">Status</th>
                {view.uploads && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  {view.fields.map((f) => <td key={f.name} className="whitespace-nowrap px-2 py-2"><FieldValue field={f} value={r.data?.[f.name]} label={r.labels?.[f.name]} compact /></td>)}
                  <td className="px-2 py-2">{r.stage ? <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: r.stage.color || '#6b7280' }}>{r.stage.label}</span> : '—'}</td>
                  {view.uploads && <td className="px-2 py-2 text-right"><UploadButton api={api} recordId={r.id} onDone={onChanged} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title={view.create?.label ?? ''}>
        {creating && <CreateForm api={api} view={view} onDone={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['portal-list', view.object] }); onChanged?.(); }} />}
      </Modal>
    </section>
  );
}

function Documents({ api }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['portal-docs'], queryFn: api.documents });
  const download = async (d) => {
    const res = await api.download(d.id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = d.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-night-2">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><FileText className="h-4 w-4" /> Statements & documents</h2>
      {isLoading ? <Spinner /> : data.length === 0 ? <p className="text-sm text-gray-400">No documents yet.</p> : (
        <ul className="divide-y divide-gray-100 dark:divide-white/5">
          {data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate">{d.filename} <span className="text-xs text-gray-400">· {d.category_label ?? 'Upload'} · {fmtDate(d.created_at)}</span></span>
              <button type="button" onClick={() => download(d)} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"><Download className="h-3 w-3" /> Download</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Messages({ api }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const { data = [] } = useQuery({ queryKey: ['portal-messages'], queryFn: api.messages });
  const send = useMutation({ mutationFn: () => api.sendMessage(text), onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['portal-messages'] }); } });
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-night-2">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white"><MessageSquare className="h-4 w-4" /> Message your relationship manager</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim().length > 1) send.mutate(); }} className="flex gap-2">
        <input className="form-input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a secure message…" maxLength={5000} />
        <Button type="submit" loading={send.isPending}><Send className="h-4 w-4" /></Button>
      </form>
      {send.error && <p className="mt-2 text-sm text-red-600">{errText(send.error)}</p>}
      <ul className="mt-3 space-y-2">
        {data.map((m) => <li key={m.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/5"><p className="text-gray-800 dark:text-white/80">{m.description}</p><p className="mt-1 text-[11px] text-gray-400">{fmtDate(m.created_at)}</p></li>)}
      </ul>
    </section>
  );
}

export default function PortalPage() {
  const { slug } = useParams();
  const api = useMemo(() => portalClient(slug), [slug]);
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(() => Boolean(portalToken.get(slug)));
  const workspace = useQuery({ queryKey: ['portal-ws', slug], queryFn: api.workspace, retry: false });
  const me = useQuery({ queryKey: ['portal-me', slug], queryFn: api.me, enabled: signedIn, retry: false });
  const views = useQuery({ queryKey: ['portal-views', slug], queryFn: api.views, enabled: signedIn, retry: false });

  const signOut = () => { portalToken.clear(slug); qc.clear(); setSignedIn(false); };
  if (signedIn && (me.error?.response?.status === 401 || views.error?.response?.status === 401)) { portalToken.clear(slug); setSignedIn(false); }

  if (workspace.isError) return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">This portal is not available.</div>;
  if (!signedIn) return <SignIn slug={slug} api={api} workspace={workspace.data} onSignedIn={() => { setSignedIn(true); qc.invalidateQueries(); }} />;

  const who = me.data;
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-1">
      <header className="border-b border-gray-200 bg-white dark:border-white/10 dark:bg-night-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {workspace.data?.logo_url ? <img src={workspace.data.logo_url} alt="" className="h-8 w-8 rounded object-contain" /> : <ShieldCheck className="h-7 w-7 text-primary-600" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{workspace.data?.name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-white/50">{who?.kind === 'introducer' ? 'Introducer portal' : 'Client portal'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-sm text-gray-600 sm:inline-flex dark:text-white/70"><User className="h-4 w-4" />{who?.display_name ?? who?.name ?? who?.email ?? ''}</span>
            <Button size="xs" variant="ghost" onClick={signOut}><LogOut className="mr-1 h-3 w-3" />Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {who?.kind === 'client' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Total relationship value', who.total_relationship_value != null ? fmtCurrency(who.total_relationship_value, 'MUR') : '—'], ['KYC status', who.kyc_status ?? '—'], ['Segment', who.segment ?? '—'], ['Risk profile valid until', who.profile_valid_until ? fmtDate(who.profile_valid_until) : '—']].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-night-2">
                <p className="text-xs text-gray-500 dark:text-white/50">{l}</p>
                <p className="mt-1 text-base font-semibold capitalize text-gray-900 dark:text-white">{String(v).replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        )}
        {who?.kind === 'introducer' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[['Referrals', who.referrals ?? 0], ['Commission earned', fmtCurrency(who.commission_earned ?? 0, 'MUR')]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-night-2"><p className="text-xs text-gray-500">{l}</p><p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{v}</p></div>
            ))}
          </div>
        )}
        {views.isLoading ? <Spinner /> : (views.data ?? []).map((v) => <Section key={v.object} api={api} view={v} onChanged={() => qc.invalidateQueries({ queryKey: ['portal-docs'] })} />)}
        {who?.kind === 'client' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Documents api={api} />
            <Messages api={api} />
          </div>
        )}
      </main>
    </div>
  );
}
