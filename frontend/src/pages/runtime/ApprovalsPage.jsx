import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Check, X, ExternalLink, Clock } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import { runtimeService } from '../../services/metadata.service';
import { useAuthStore } from '../../store/authStore';
import { showError, showSuccess } from '../../utils/dialog';
import { fmtDateTime } from '../../utils/formatters';

/**
 * Approvals inbox — every workflow approval step (credit decisions, KYC
 * sign-off, maker-checker on disbursements and fund orders, gifts above the
 * threshold…) waits here for the people it names. Approving resumes the
 * workflow; rejecting takes its rejection path. Each decision is audited.
 */
const errText = (e) => e?.response?.data?.error?.message ?? e?.response?.data?.message ?? e?.message;

function ApprovalCard({ item, focus, onDecide, busy }) {
  const [comment, setComment] = useState('');
  const pending = item.status === 'pending' && item.token;
  return (
    <article className={clsx('rounded-2xl border bg-white p-4 dark:bg-night-2', focus ? 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-500/30' : 'border-gray-200 dark:border-white/10')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</h3>
          {item.message && <p className="mt-1 text-sm text-gray-600 dark:text-white/70">{item.message}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-white/50">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDateTime(item.requested_at)}</span>
            {item.requested_by_name && <span>Requested by {item.requested_by_name}</span>}
            {item.workflow && <span>{item.workflow}</span>}
            {item.approvers?.length > 0 && <span>Approvers: {item.approvers.map((a) => a.name).join(', ')}</span>}
          </p>
        </div>
        {item.record?.link && (
          <Link to={item.record.link} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-primary-700 hover:bg-gray-50 dark:border-white/10 dark:text-primary-300 dark:hover:bg-white/5">
            {item.record.object}: {item.record.title} <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
      {pending ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000}
            placeholder="Comment (optional, recorded with your decision)"
            className="min-w-[14rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
          />
          <Button size="sm" loading={busy === `${item.token}:approve`} onClick={() => onDecide(item, 'approve', comment)}><Check className="mr-1 h-4 w-4" />Approve</Button>
          <Button size="sm" variant="secondary" loading={busy === `${item.token}:reject`} onClick={() => onDecide(item, 'reject', comment)}><X className="mr-1 h-4 w-4" />Reject</Button>
        </div>
      ) : item.decided_at ? (
        <p className="mt-3 text-xs text-gray-600 dark:text-white/60">
          <span className={clsx('mr-2 rounded-full px-2 py-0.5 font-semibold', item.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300')}>{item.status}</span>
          by {item.decided_by_name} on {fmtDateTime(item.decided_at)}{item.comment ? ` — “${item.comment}”` : ''}
        </p>
      ) : null}
    </article>
  );
}

export default function ApprovalsPage() {
  const [params] = useSearchParams();
  const focusToken = params.get('token');
  const isManager = useAuthStore((s) => s.isAdmin?.() || s.isManager?.());
  const [scope, setScope] = useState('mine');
  const [busy, setBusy] = useState(null);
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['approvals', scope],
    queryFn: () => runtimeService.getApprovals(scope),
    refetchInterval: 60_000,
  });
  const items = Array.isArray(data) ? data : data?.data ?? [];

  useEffect(() => {
    if (focusToken) document.getElementById(`approval-${focusToken}`)?.scrollIntoView({ block: 'center' });
  }, [focusToken, items.length]);

  const decide = useMutation({
    mutationFn: ({ item, action, comment }) => runtimeService.decideApproval(item.token, action, comment),
    onMutate: ({ item, action }) => setBusy(`${item.token}:${action}`),
    onSettled: () => setBusy(null),
    onSuccess: (_r, { action }) => {
      showSuccess(action === 'approve' ? 'Approved — the process continues.' : 'Rejected — the requester has been informed by the workflow.');
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e) => showError(errText(e)),
  });

  const tabs = [['mine', 'Waiting for me'], ...(isManager ? [['all', 'All pending']] : []), ['decided', 'My decisions']];
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <PageHeader icon={ClipboardCheck} eyebrow="Tools" title="Approvals" subtitle="Credit decisions, KYC sign-off, maker-checker and other requests that need your decision." />
      <div role="tablist" className="flex gap-1 rounded-xl bg-gray-100 p-1 text-sm dark:bg-white/5">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)}
            className={clsx('flex-1 rounded-lg px-3 py-1.5 font-medium', scope === k ? 'bg-white text-gray-900 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:text-gray-800 dark:text-white/50')}>
            {label}
          </button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-gray-500">Loading…</p>
        : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/15 dark:text-white/50">
            {scope === 'decided' ? 'You have not decided any approvals yet.' : 'Nothing is waiting for a decision.'}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} id={item.token ? `approval-${item.token}` : undefined}>
                <ApprovalCard item={item} focus={focusToken && item.token === focusToken} busy={busy} onDecide={(it, action, comment) => decide.mutate({ item: it, action, comment })} />
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
