import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import { ArrowLeft, RotateCcw, Trash2, Trash } from 'lucide-react';
import { confirmDialog } from '../../utils/dialog';

const selectCls = 'rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white/80 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

// Best-effort human label for a record from its hydrated CRM/EAV data.
function summarize(data = {}) {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return (
    name ||
    data.name || data.company || data.account_name || data.subject ||
    data.title || data.email || data.phone || null
  );
}

// A short secondary line (email / company) distinct from the primary label.
function secondary(data = {}, primary) {
  const bits = [data.email, data.company, data.phone].filter(Boolean).filter(v => v !== primary);
  return bits[0] || null;
}

// ── Admin recovery bin for soft-deleted records ─────────────────────────────
export default function RecordsTrashPage() {
  const qc = useQueryClient();
  const [error, setError] = useState(null);
  const [objectFilter, setObjectFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['records-trash'],
    queryFn:  () => builderService.getTrashedRecords(),
  });
  const allRecords = useMemo(() => data?.data || [], [data]);

  // Object filter options derived from what's actually in the Trash.
  const objectOptions = useMemo(() => {
    const map = new Map();
    for (const r of allRecords) {
      if (r.object && !map.has(r.object.id)) {
        map.set(r.object.id, r.object.label || r.object.name);
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id: String(id), label }));
  }, [allRecords]);

  const records = objectFilter
    ? allRecords.filter(r => String(r.object?.id) === objectFilter)
    : allRecords;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['records-trash'] });
    // Restored/purged records affect the runtime lists + boards (keyed by object).
    qc.invalidateQueries({ queryKey: ['runtime-records'] });
  };

  const restoreMutation = useMutation({
    mutationFn: (id) => builderService.restoreRecord(id),
    onSuccess:  invalidate,
    onError:    (e) => setError(e.response?.data?.message || e.message),
  });

  const purgeMutation = useMutation({
    mutationFn: (id) => builderService.purgeRecord(id),
    onSuccess:  invalidate,
    onError:    (e) => setError(e.response?.data?.message || e.message),
  });

  const handlePurge = async (row) => {
    const label = summarize(row.data) || `record #${row.id}`;
    if (await confirmDialog({
      title: 'Permanently delete record',
      message: `“${label}” will be erased for good. This cannot be undone.`,
      confirmLabel: 'Delete forever',
    })) {
      purgeMutation.mutate(row.id);
    }
  };

  const columns = [
    {
      key: 'object', header: 'Type',
      render: (v) => v
        ? <Badge variant="secondary">{v.label || v.name}</Badge>
        : <span className="text-xs text-gray-400 italic">—</span>,
    },
    {
      key: 'data', header: 'Record',
      render: (v, row) => {
        const primary = summarize(v) || `Record #${row.id}`;
        const sub = secondary(v, primary);
        return (
          <div className="min-w-0">
            <span className="block text-sm text-gray-800 dark:text-white/80 truncate">{primary}</span>
            {sub && <span className="block text-[11px] text-gray-400 truncate">{sub}</span>}
          </div>
        );
      },
    },
    {
      key: 'pipeline_stage', header: 'Stage',
      render: (v) => v
        ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ background: v.color || '#6366f1' }}
          >
            {v.label}
          </span>
        )
        : <span className="text-xs text-gray-400">—</span>,
    },
    {
      key: 'deleted_at', header: 'Deleted',
      render: (v, row) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {fmtDate(v)}
          {row.deleted_by ? <span className="block text-gray-400">by {row.deleted_by}</span> : null}
        </span>
      ),
    },
    {
      key: 'id', header: '',
      render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            size="xs"
            onClick={() => restoreMutation.mutate(row.id)}
            loading={restoreMutation.isPending && restoreMutation.variables === row.id}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />Restore
          </Button>
          <button
            title="Delete permanently"
            onClick={() => handlePurge(row)}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader
        icon={Trash}
        eyebrow="Builder"
        title="Trash"
        subtitle="Records that users deleted. Restore them to their list, or delete them permanently."
        className="!mb-4"
        actions={(
          <Link to="/builder/pipeline">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-1.5" />Back to Pipeline Builder
            </Button>
          </Link>
        )}
      />

      {error && <Alert variant="error" className="mb-4" onClose={() => setError(null)}>{error}</Alert>}

      <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 text-sm text-amber-800 dark:text-amber-300">
        <p className="text-xs leading-5">
          When <strong>Record Delete Mode</strong> is set to <strong>Soft</strong> (Settings → Data &amp; Trash),
          deleted records are hidden from users but kept here for recovery. <strong>Restore</strong> returns a record
          to its object&apos;s list; <strong>Delete permanently</strong> removes it for good.
        </p>
      </div>

      {objectOptions.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Filter by type:</label>
          <select className={selectCls} value={objectFilter} onChange={e => setObjectFilter(e.target.value)}>
            <option value="">All ({allRecords.length})</option>
            {objectOptions.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <DataTable
        icon={Trash}
        title="Deleted Records"
        columns={columns}
        data={records}
        loading={isLoading}
        emptyMessage="Trash is empty."
      />
    </div>
  );
}
