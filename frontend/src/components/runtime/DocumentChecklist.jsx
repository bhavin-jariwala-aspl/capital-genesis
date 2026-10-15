import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Copy, Link2, Mail, Check } from 'lucide-react';
import clsx from 'clsx';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { uploadLinksService } from '../../services/uploadLinks.service';
import { apiErrorText } from '../../utils/record';

/**
 * The record's document checklist — what is in and what is missing — with a
 * secure link the client can use to upload the rest without signing in
 * (copy it, or email it). Renders nothing for objects without a checklist.
 */
export default function DocumentChecklist({ recordId, clientEmail = '', clientName = '', onCategories }) {
  const { data, isLoading } = useQuery({
    queryKey: ['doc-checklist', recordId],
    queryFn: () => uploadLinksService.checklist(recordId).then((r) => {
      onCategories?.(r.data?.categories ?? []);
      return r.data;
    }),
    enabled: !!recordId,
    staleTime: 15_000,
  });
  const [copied, setCopied] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [error, setError] = useState(null);

  if (isLoading || !data?.checklists?.length) return null;

  const copy = async () => {
    setError(null);
    try {
      const { data: link } = await uploadLinksService.create(recordId);
      await navigator.clipboard.writeText(link.url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch (err) { setError(apiErrorText(err, 'Could not create the link.')); }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/50">Checklist</h4>
        <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold',
          data.outstanding ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300')}>
          {data.outstanding ? `${data.outstanding} outstanding` : 'Complete'}
        </span>
      </div>
      {data.checklists.map((c) => (
        <div key={c.id} className="mt-2">
          {data.checklists.length > 1 && <p className="mb-1 text-xs font-medium text-gray-700 dark:text-white/70">{c.label}</p>}
          <ul className="space-y-1">
            {c.items.map((i, n) => (
              <li key={`${c.id}-${n}`} className="flex items-start gap-2 text-sm">
                {i.received
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-label="Received" />
                  : <Circle className={clsx('mt-0.5 h-4 w-4 shrink-0', i.required ? 'text-amber-500' : 'text-gray-300')} aria-label="Missing" />}
                <span className={clsx('min-w-0', i.received ? 'text-gray-700 dark:text-white/80' : 'text-gray-900 dark:text-white')}>
                  {i.label}{!i.required && <span className="text-xs text-gray-400"> (optional)</span>}
                  {i.documents[0] && <span className="block truncate text-xs text-gray-400">{i.documents[0].filename} · {i.documents[0].status}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {data.outstanding > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-white/10">
          <Button size="xs" onClick={() => setEmailing(true)}><Mail className="mr-1 h-3.5 w-3.5" />Email link to client</Button>
          <Button size="xs" variant="secondary" onClick={copy}>
            {copied ? <><Check className="mr-1 h-3.5 w-3.5" />Copied</> : <><Copy className="mr-1 h-3.5 w-3.5" />Copy client link</>}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Modal open={emailing} onClose={() => setEmailing(false)} title="Send a secure upload link">
        {emailing && <EmailLink recordId={recordId} defaultTo={clientEmail} defaultName={clientName} onDone={() => setEmailing(false)} />}
      </Modal>
    </div>
  );
}

function EmailLink({ recordId, defaultTo, defaultName, onDone }) {
  const [to, setTo] = useState(defaultTo ?? '');
  const [name, setName] = useState(defaultName ?? '');
  const [language, setLanguage] = useState('en');
  const [days, setDays] = useState('14');
  const send = useMutation({
    mutationFn: () => uploadLinksService.create(recordId, { days: Number(days), email: { to: to.trim(), name: name.trim() || null, language } }),
  });
  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Link2 className="h-8 w-8 text-emerald-500" />
        <p className="font-medium text-gray-900 dark:text-white">Link sent to {to.trim()}</p>
        <p className="text-sm text-gray-500">It works until {new Date(send.data.data.expires_at).toLocaleDateString()}. Uploads appear in this record&apos;s Docs.</p>
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Client email" type="email" required value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
        <Input label="Client name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
        <Select label="Link valid for" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
      </div>
      <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/5 dark:text-white/50">
        The client sees only the list of documents still needed — no sign-in, and nothing already on file.
      </p>
      {send.isError && <Alert variant="error">{apiErrorText(send.error, 'The email could not be sent.')}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={send.isPending}><Mail className="mr-1.5 h-4 w-4" />Send link</Button>
      </div>
    </form>
  );
}
