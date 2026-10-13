import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Copy, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { builderService } from '../../services/builder.service';
import { confirmDialog } from '../../utils/dialog';

/**
 * PublicFormPanel — turn a Builder form into a public web-to-record form.
 *
 * Publishing gives the form an unguessable key. The hosted page `/f/<key>`
 * (or any website posting to `/api/public/forms/<key>`) then creates records of
 * the form's object through the normal record path — so routing, SLA timers,
 * acknowledgements and scoring are whatever the Builder says, not intake code.
 */
export default function PublicFormPanel({ form }) {
  const qc = useQueryClient();
  const pub = form?.config?.public ?? {};
  const [settings, setSettings] = useState({
    success_message: pub.success_message ?? '',
    consent_field: pub.consent_field ?? '',
    consent_text_version: pub.consent_text_version ?? '',
    stage: pub.stage ?? '',
  });
  const published = Boolean(form?.public_key && pub.enabled);
  const url = published ? `${window.location.origin}/f/${form.public_key}` : null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['form-full', String(form.id)] });
  const publish = useMutation({
    mutationFn: (rotate = false) => builderService.publishForm(form.id, {
      ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== '')),
      ...(rotate ? { rotate: true } : {}),
    }),
    onSuccess: refresh,
  });
  const unpublish = useMutation({ mutationFn: () => builderService.unpublishForm(form.id), onSuccess: refresh });

  if (!form?.id) return null;
  return (
    <details className="mx-6 mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]" open={published}>
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-gray-700 dark:text-white/80">
        <Globe className="h-4 w-4 text-primary-500" />
        Public web form
        <span className={published ? 'ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700' : 'ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500'}>
          {published ? 'Published' : 'Not published'}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Input label="Thank-you message" value={settings.success_message} onChange={(e) => setSettings({ ...settings, success_message: e.target.value })} placeholder="Thank you — we will be in touch shortly." />
        <Input label="Consent field (API name)" value={settings.consent_field} onChange={(e) => setSettings({ ...settings, consent_field: e.target.value })} placeholder="e.g. consent_marketing — must be ticked to submit" />
        <Input label="Consent text version" value={settings.consent_text_version} onChange={(e) => setSettings({ ...settings, consent_text_version: e.target.value })} placeholder="e.g. 2026-10-v1 (stored with each submission)" />
        <Input label="Starting stage (API name)" value={settings.stage} onChange={(e) => setSettings({ ...settings, stage: e.target.value })} placeholder="e.g. new" />
      </div>
      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2 font-mono text-xs dark:bg-white/5">
          <span className="truncate">{url}</span>
          <button type="button" className="text-primary-600" onClick={() => navigator.clipboard?.writeText(url)}><Copy className="h-3.5 w-3.5" /></button>
          <span className="w-full text-[11px] font-sans text-gray-500">
            Embed: {'<iframe src="'}{url}{'" style="width:100%;height:720px;border:0"></iframe>'} — or post JSON to /api/public/forms/{form.public_key}.
            UTM tags and page_url are stored when the object has fields with those names.
          </span>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => publish.mutate(false)} loading={publish.isPending}>{published ? 'Save settings' : 'Publish'}</Button>
        {published && (
          <>
            <Button size="sm" variant="secondary" onClick={async () => (await confirmDialog({ title: 'New link', message: 'The current link stops working immediately.', confirmLabel: 'Rotate' })) && publish.mutate(true)}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> New link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => unpublish.mutate()} loading={unpublish.isPending}>Unpublish</Button>
          </>
        )}
      </div>
      {(publish.error || unpublish.error) && <p className="mt-2 text-xs text-red-600">{(publish.error || unpublish.error)?.response?.data?.error?.message || 'Could not update the form'}</p>}
    </details>
  );
}
