import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitMerge } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import RecordPicker from '../ui/RecordPicker';
import { runtimeService } from '../../services/metadata.service';
import { confirmDialog, showError, showSuccess } from '../../utils/dialog';
import { useAuthStore } from '../../store/authStore';

/**
 * "Merge into…" on a record panel (PRD C360-FR-08). The current record is the
 * duplicate: its blank-filling values move to the survivor, everything that
 * pointed at it is re-pointed, and it goes to the Trash. Reversible for 30
 * days from the audit trail. Managers and administrators only.
 */
export default function RecordMerge({ objectName, recordId, onMerged }) {
  const qc = useQueryClient();
  const isManagerOrAdmin = useAuthStore((s) => s.isAdmin() || s.isManager());
  const [open, setOpen] = useState(false);
  const [into, setInto] = useState(null);

  const merge = useMutation({
    mutationFn: () => runtimeService.mergeRecord(recordId, Number(into)),
    onSuccess: (res) => {
      const r = res?.data ?? res;
      setOpen(false);
      qc.invalidateQueries();
      showSuccess({ title: 'Records merged', message: `${r?.repointed ?? 0} linked records were moved; ${r?.filled?.length ?? 0} empty fields filled. You can reverse this for 30 days.` });
      onMerged?.(Number(into));
    },
    onError: (e) => showError(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Merge failed'),
  });

  if (!isManagerOrAdmin || !objectName) return null;
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        <GitMerge className="w-3 h-3 mr-1" /> Merge into…
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Merge this duplicate"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!into || Number(into) === Number(recordId)}
              loading={merge.isPending}
              onClick={async () => (await confirmDialog({ title: 'Merge records?', message: 'This record will be moved to the Trash and everything linked to it re-pointed to the record you chose.', confirmLabel: 'Merge' })) && merge.mutate()}
            >
              Merge
            </Button>
          </div>
        )}
      >
        <p className="mb-3 text-sm text-gray-600 dark:text-white/60">
          Choose the record to keep. Empty fields on it are filled from this record; nothing on it is overwritten.
        </p>
        <RecordPicker targetObject={objectName} value={into} onChange={setInto} label="Keep this record" />
      </Modal>
    </>
  );
}
