import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import TextArea from '../ui/TextArea';
import Input from '../ui/Input';
import { runtimeService } from '../../services/metadata.service';
import { showError, showSuccess } from '../../utils/dialog';
import { invalidateRecordData } from '../../utils/invalidate';

/** Same rule as the server (backend/src/utils/record-action.js). */
export function actionAvailable(action, data) {
  const rule = action?.show_when;
  if (!rule?.field) return true;
  const actual = String(data?.[rule.field] ?? '');
  const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim());
  switch (rule.op ?? 'eq') {
    case 'eq': return actual === String(rule.value ?? '');
    case 'neq': return actual !== String(rule.value ?? '');
    case 'in': return list(rule.value).includes(actual);
    case 'nin': return !list(rule.value).includes(actual);
    default: return false;
  }
}

/**
 * RecordActions — one button per manual workflow on the object.
 *
 * Admins add record actions ("Run eligibility", "Submit to credit", "Screen
 * client") by creating a workflow with the Manual trigger in the Builder; the
 * button appears here with no frontend change. The server re-checks that the
 * user can edit the record before running it.
 *
 * A workflow's trigger config can limit the button to matching records
 * (`show_when`) and ask the user for values first (`inputs`, e.g. a dismiss
 * reason) — those are saved on the record before the workflow runs — and
 * replace the generic confirmation (`success_message`).
 */
export default function RecordActions({ objectId, recordId, record, onDone }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(null);
  const [asking, setAsking] = useState(null);   // the action whose inputs are being collected
  const [values, setValues] = useState({});
  const { data } = useQuery({
    queryKey: ['record-actions', objectId],
    queryFn: () => runtimeService.getObjectActions(objectId),
    enabled: !!objectId,
    staleTime: 60_000,
  });
  const run = useMutation({
    mutationFn: ({ wf, vals }) => runtimeService.runRecordAction(recordId, wf.id, vals),
    onMutate: ({ wf }) => setRunning(wf.id),
    onSettled: () => setRunning(null),
    onSuccess: (res, { wf }) => {
      const result = res?.data ?? res;
      if (result?.error) showError(`${wf.label}: ${result.error}`);
      else showSuccess([wf.success_message, result?.summary].filter(Boolean).join(' ') || `${wf.label} completed.`);
      setAsking(null);
      invalidateRecordData(qc, { recordId, objectId });
      onDone?.();
    },
    onError: (err, { wf }) => showError(`${wf.label}: ${err?.response?.data?.error?.message || err.message}`),
  });

  const actions = (data?.data ?? []).filter((wf) => !record || actionAvailable(wf, record.data));
  if (!actions.length) return null;

  const start = (wf) => {
    if (wf.inputs?.length) { setValues({}); setAsking(wf); return; }
    run.mutate({ wf });
  };
  const missing = asking ? asking.inputs.filter((i) => i.required && !String(values[i.field] ?? '').trim()) : [];

  return (
    <>
      {actions.map((wf) => (
        <Button key={wf.id} size="xs" variant="secondary" title={wf.description || wf.label}
          onClick={() => start(wf)} disabled={running !== null}>
          <Zap className="w-3 h-3 mr-1" />
          {running === wf.id ? 'Running…' : wf.label}
        </Button>
      ))}
      {asking && (
        <Modal open onClose={() => !running && setAsking(null)} title={asking.label} subtitle={asking.description} icon={Zap} size="md"
          footer={(
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsking(null)} disabled={running !== null}>Cancel</Button>
              <Button variant="primary" disabled={running !== null || missing.length > 0}
                onClick={() => run.mutate({ wf: asking, vals: values })}>
                {running ? 'Running…' : asking.label}
              </Button>
            </div>
          )}>
          <div className="space-y-4">
            {asking.inputs.map((i) => (i.type === 'textarea' ? (
              <TextArea key={i.field} id={`action-${i.field}`} label={i.label} required={i.required} rows={3}
                value={values[i.field] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [i.field]: e.target.value }))} />
            ) : (
              <Input key={i.field} id={`action-${i.field}`} label={i.label} required={i.required}
                value={values[i.field] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [i.field]: e.target.value }))} />
            )))}
          </div>
        </Modal>
      )}
    </>
  );
}
