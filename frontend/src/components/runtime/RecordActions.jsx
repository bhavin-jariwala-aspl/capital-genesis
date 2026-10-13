import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import Button from '../ui/Button';
import { runtimeService } from '../../services/metadata.service';
import { showError, showSuccess } from '../../utils/dialog';

/**
 * RecordActions — one button per manual workflow on the object.
 *
 * Admins add record actions ("Run eligibility", "Submit to credit", "Screen
 * client") by creating a workflow with the Manual trigger in the Builder; the
 * button appears here with no frontend change. The server re-checks that the
 * user can edit the record before running it.
 */
export default function RecordActions({ objectId, recordId, onDone }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(null);
  const { data } = useQuery({
    queryKey: ['record-actions', objectId],
    queryFn: () => runtimeService.getObjectActions(objectId),
    enabled: !!objectId,
    staleTime: 60_000,
  });
  const run = useMutation({
    mutationFn: (wf) => runtimeService.runRecordAction(recordId, wf.id),
    onMutate: (wf) => setRunning(wf.id),
    onSettled: () => setRunning(null),
    onSuccess: (res, wf) => {
      const result = res?.data ?? res;
      if (result?.error) showError(`${wf.label}: ${result.error}`);
      else showSuccess(`${wf.label} completed.`);
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['related', recordId] });
      onDone?.();
    },
    onError: (err, wf) => showError(`${wf.label}: ${err?.response?.data?.error?.message || err.message}`),
  });

  const actions = data?.data ?? [];
  if (!actions.length) return null;
  return actions.map((wf) => (
    <Button key={wf.id} size="xs" variant="secondary" title={wf.description || wf.label}
      onClick={() => run.mutate(wf)} disabled={running !== null}>
      <Zap className="w-3 h-3 mr-1" />
      {running === wf.id ? 'Running…' : wf.label}
    </Button>
  ));
}
