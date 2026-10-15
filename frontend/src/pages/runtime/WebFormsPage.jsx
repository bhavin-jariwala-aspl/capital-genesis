import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Calculator, Check, ClipboardList, Copy, ExternalLink, FileText, Globe, Mail, MessageSquare, Newspaper, PhoneCall, Send,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import TextArea from '../../components/ui/TextArea';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { webFormsService } from '../../services/webForms.service';
import { apiErrorText } from '../../utils/record';

/**
 * Web forms — every published public form (/f/<key>) of the workspace, for any
 * staff member to share with a client: copy a link (optionally with a product
 * preselected) or email it. Links are tagged (utm_source=crm), so enquiries that
 * come from a shared form can be told apart from website traffic.
 */

const ICONS = { calculator: Calculator, web_form: Globe };
function iconFor(form) {
  const t = form.title.toLowerCase();
  if (t.includes('call')) return PhoneCall;
  if (t.includes('newsletter')) return Newspaper;
  if (t.includes('questionnaire')) return ClipboardList;
  if (t.includes('estimate') || t.includes('calculator')) return Calculator;
  return ICONS[form.channel] ?? FileText;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (http, permissions): fall back to a hidden textarea.
    const el = document.createElement('textarea');
    el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select();
    const done = document.execCommand?.('copy') ?? false;
    el.remove();
    return done;
  }
}

function ProductPicker({ form, value, onChange, label = 'Product (optional)' }) {
  if (!form.products.length) return null;
  return (
    <Select
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[{ value: '', label: 'Client chooses' }, ...form.products]}
    />
  );
}

function EmailForm({ form, initialProd, onDone }) {
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [prod, setProd] = useState(initialProd);
  const [language, setLanguage] = useState('en');
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () => webFormsService.send(form.id, { to: to.trim(), name: name.trim() || null, prod: prod || null, language, message: message.trim() || null }),
  });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/15"><Check className="h-6 w-6 text-emerald-600" /></span>
        <p className="font-medium text-gray-900 dark:text-white">Sent to {to.trim()}</p>
        <p className="text-sm text-gray-500 dark:text-white/60">It is recorded under Email logs.</p>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Client email" type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" autoFocus />
        <Input label="Client name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anne Dupont" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Email language" value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
        <ProductPicker form={form} value={prod} onChange={setProd} />
      </div>
      <TextArea label="Personal note (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="As discussed on the phone today…" maxLength={2000} />
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/5 dark:text-white/50">
        The client receives a short email with a button that opens <strong>{form.title}</strong>
        {prod ? <> with <strong>{form.products.find((p) => p.value === prod)?.label}</strong> already chosen</> : null}.
      </p>
      {send.isError && <Alert variant="error">{apiErrorText(send.error, 'The email could not be sent.')}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={send.isPending}><Send className="mr-1.5 h-4 w-4" />Send</Button>
      </div>
    </form>
  );
}

function FormCard({ form, onEmail }) {
  const Icon = iconFor(form);
  const [prod, setProd] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const copy = async () => {
    setError(null);
    try {
      const { data } = await webFormsService.link(form.id, prod || null);
      if (await copyText(data.url)) { setCopied(true); setTimeout(() => setCopied(false), 2000); } else setError('Copy failed — use Open and copy the address.');
    } catch (err) { setError(apiErrorText(err, 'Could not create the link.')); }
  };
  const open = async () => {
    try {
      const { data } = await webFormsService.link(form.id, prod || null);
      window.open(data.url, '_blank', 'noopener');
    } catch (err) { setError(apiErrorText(err, 'Could not open the form.')); }
  };

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">{form.title}</h3>
          {form.description && <p className="mt-0.5 text-sm text-gray-500 dark:text-white/60">{form.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {form.object && <Badge>Creates: {form.object}</Badge>}
            {form.products.length > 0 && <Badge variant="info">{form.products.length} product{form.products.length > 1 ? 's' : ''}</Badge>}
          </div>
        </div>
      </div>
      {form.products.length > 0 && (
        <div className="mt-4"><ProductPicker form={form} value={prod} onChange={setProd} label="Preselect a product" /></div>
      )}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button size="sm" onClick={() => onEmail(form, prod)}><Mail className="mr-1.5 h-4 w-4" />Email to client</Button>
        <Button size="sm" variant="secondary" onClick={copy} aria-live="polite">
          {copied ? <><Check className="mr-1.5 h-4 w-4" />Copied</> : <><Copy className="mr-1.5 h-4 w-4" />Copy link</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={open} title="Open the form in a new tab"><ExternalLink className="mr-1.5 h-4 w-4" />Open</Button>
      </div>
    </div>
  );
}

export default function WebFormsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['web-forms'], queryFn: webFormsService.list });
  const forms = data?.data ?? [];
  const [emailing, setEmailing] = useState(null); // { form, prod }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        icon={MessageSquare}
        eyebrow="Tools"
        title="Web forms"
        subtitle="Share a form with a client when they ask for one: email it, or copy the link to paste into a chat or message."
      />
      {isLoading ? <div className="flex justify-center py-16"><Spinner /></div>
        : error ? <Alert variant="error">{apiErrorText(error, 'Could not load the web forms.')}</Alert>
          : forms.length === 0 ? (
            <div className="card p-10 text-center text-sm text-gray-500 dark:text-white/60">
              No forms are published yet. An administrator can publish one in <strong>Builder ▸ Form Builder ▸ Public web form</strong>.
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-white/60">{forms.length} published form{forms.length > 1 ? 's' : ''}. Answers become records in the CRM and are routed to the right team.</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {forms.map((f) => <FormCard key={f.id} form={f} onEmail={(form, prod) => setEmailing({ form, prod })} />)}
              </div>
            </>
          )}
      <Modal open={Boolean(emailing)} onClose={() => setEmailing(null)} title={emailing ? `Email “${emailing.form.title}”` : ''}>
        {emailing && <EmailForm key={emailing.form.id} form={emailing.form} initialProd={emailing.prod} onDone={() => setEmailing(null)} />}
      </Modal>
    </div>
  );
}
