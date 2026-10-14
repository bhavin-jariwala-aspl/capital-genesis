import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import { metadataService } from '../../services/metadata.service';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import TextArea from '../../components/ui/TextArea';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Toggle from '../../components/ui/Toggle';
import { Plus, Pencil, Trash2, GripVertical, X, Shield, Kanban, ShieldCheck, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { EntityPermissionPanel } from '../../components/builder/PermissionPanel';
import { COLORS } from '../../utils/constants';

const selectCls = 'block w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white/80 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:disabled:bg-white/[0.02] disabled:text-gray-400 dark:disabled:text-white/20';

// Views the admin can enable for the object's module page. The runtime
// View toggle shows only the views ticked here. Card view is opt-in: it is not
// ticked on a new pipeline, and a pipeline that never chose its views gets
// Table + Pipeline only.
const VIEW_OPTIONS = [
  { key: 'table',    label: 'Table view',    hint: 'Flat, sortable spreadsheet of records' },
  { key: 'cards',    label: 'Card view',     hint: 'Visual grid of record cards (optional)' },
  { key: 'pipeline', label: 'Pipeline view', hint: 'Kanban board, one column per stage' },
];
const ALL_VIEWS = VIEW_OPTIONS.map((v) => v.key);
const DEFAULT_VIEWS = ['table', 'pipeline'];

// ── Stage row used inside the pipeline editor ──────────────────────────────
function StageRow({ stage, index, onChange, onRemove }) {
  const cfg = stage.config || {};
  const gated = (cfg.required_fields?.length || cfg.entry_rule?.expression);
  const setCfg = (patch) => {
    const next = { ...cfg, ...patch };
    if (!next.required_fields?.length) delete next.required_fields;
    if (!next.entry_rule?.expression) delete next.entry_rule;
    onChange(index, 'config', next);
  };
  return (
    <div className="p-3 bg-white dark:bg-night-2 border border-gray-200 dark:border-white/[0.07] rounded-lg">
      <div className="flex items-center gap-3">
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

        {/* colour swatch */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: stage.color }} />
          <select
            className="text-xs border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 bg-white dark:bg-white/5 dark:text-white/70"
            value={stage.color}
            onChange={e => onChange(index, 'color', e.target.value)}
          >
            {COLORS.STAGE.map(c => (
              <option key={c} value={c} style={{ background: c, color: '#fff' }}>{c}</option>
            ))}
          </select>
        </div>

        <input
          className="flex-1 text-sm border border-gray-200 dark:border-white/10 rounded px-2 py-1.5 bg-white dark:bg-white/5 dark:text-white/80 focus:border-primary-400 focus:outline-none"
          placeholder="Stage label (e.g. Qualified)"
          value={stage.label || ''}
          onChange={e => onChange(index, 'label', e.target.value)}
        />

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Stage gate: what must be true before a record may enter this stage.
          Enforced by the server for drags, API, bulk and workflow moves. */}
      <details className="mt-2 ml-7" open={Boolean(gated)}>
        <summary className="cursor-pointer text-xs text-gray-500 dark:text-white/40">
          Entry rules{gated ? ' · on' : ''}
        </summary>
        <div className="mt-2 grid gap-2">
          <input
            className="text-xs border border-gray-200 dark:border-white/10 rounded px-2 py-1.5 bg-white dark:bg-white/5 dark:text-white/80"
            placeholder="Required fields (API names, comma-separated), e.g. disqualify_reason"
            value={(cfg.required_fields || []).join(', ')}
            onChange={e => setCfg({ required_fields: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}
          />
          <input
            className="text-xs font-mono border border-gray-200 dark:border-white/10 rounded px-2 py-1.5 bg-white dark:bg-white/5 dark:text-white/80"
            placeholder="Formula that must be true, e.g. kyc_status = 'approved' AND security_complete"
            value={cfg.entry_rule?.expression || ''}
            onChange={e => setCfg({ entry_rule: { ...(cfg.entry_rule || {}), expression: e.target.value } })}
          />
          <input
            className="text-xs border border-gray-200 dark:border-white/10 rounded px-2 py-1.5 bg-white dark:bg-white/5 dark:text-white/80"
            placeholder="Message shown when the rule blocks a move"
            value={cfg.entry_rule?.message || ''}
            onChange={e => setCfg({ entry_rule: { ...(cfg.entry_rule || {}), message: e.target.value } })}
            disabled={!cfg.entry_rule?.expression}
          />
        </div>
      </details>
    </div>
  );
}

// ── Pipeline create / edit modal ───────────────────────────────────────────
function PipelineModal({ isOpen, onClose, editing, onSaved }) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [stages, setStages] = useState([]);
  const [enabledViews, setEnabledViews] = useState(DEFAULT_VIEWS);
  // Per-pipeline delete mode: true = soft (records go to Trash), false = hard (permanent).
  const [softDelete, setSoftDelete] = useState(true);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const toggleView = (key) =>
    setEnabledViews(prev => (prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]));

  // ── module / object options ──────────────────────────────
  const { data: modulesData } = useQuery({
    queryKey: ['modules'],
    queryFn:  () => metadataService.getModules(),
  });
  const allModules = modulesData?.data || [];

  const { data: objectsData } = useQuery({
    queryKey: ['objects', selectedModuleId],
    queryFn:  () => metadataService.getObjects(selectedModuleId),
    enabled:  !!selectedModuleId,
  });
  const allObjects = objectsData?.data || [];

  // ── fetch full pipeline (with stages) when editing ───────
  const { data: fullPipelineData } = useQuery({
    queryKey: ['pipeline-full', editing?.id],
    queryFn:  () => builderService.getPipeline(editing.id),
    enabled:  isOpen && !!editing?.id,
  });

  // hydrate on open
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      reset({ label: editing.label || editing.name, description: editing.description });
      const mod = editing.object?.module;
      setSelectedModuleId(mod ? String(mod.id) : '');
      setSelectedObjectId(editing.object_id ? String(editing.object_id) : '');
      // stages come from the full fetch; seed from editing.stages if already present
      const src = fullPipelineData?.data?.stages || editing.stages || [];
      setStages(src.map(s => ({ ...s })));
      const cfg = fullPipelineData?.data?.config || editing.config || {};
      const views = cfg.enabled_views;
      setEnabledViews(Array.isArray(views) && views.length ? views : DEFAULT_VIEWS);
      setSoftDelete(cfg.delete_mode !== 'hard'); // default soft unless explicitly hard
    } else {
      reset({});
      setSelectedModuleId('');
      setSelectedObjectId('');
      setStages([
        { label: 'New',       color: COLORS.STAGE[0], order_index: 1 },
        { label: 'In Progress', color: COLORS.STAGE[1], order_index: 2 },
        { label: 'Done',      color: COLORS.STAGE[4], order_index: 3 },
      ]);
      setEnabledViews(DEFAULT_VIEWS);
      setSoftDelete(true);
    }
    setFormError(null);
  }, [isOpen, editing, reset, fullPipelineData]);

  // update stages + enabled views + delete mode when full pipeline loads
  useEffect(() => {
    if (fullPipelineData?.data?.stages) {
      setStages(fullPipelineData.data.stages.map(s => ({ ...s })));
    }
    const cfg = fullPipelineData?.data?.config;
    if (Array.isArray(cfg?.enabled_views) && cfg.enabled_views.length) setEnabledViews(cfg.enabled_views);
    if (cfg?.delete_mode) setSoftDelete(cfg.delete_mode !== 'hard');
  }, [fullPipelineData]);

  const handleStageChange = (idx, field, val) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };
  const handleRemoveStage = (idx) => {
    setStages(prev => prev.filter((_, i) => i !== idx));
  };
  const handleAddStage = () => {
    setStages(prev => [
      ...prev,
      { label: '', color: COLORS.STAGE[prev.length % COLORS.STAGE.length], order_index: prev.length + 1 },
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (formData) => {
      if (!selectedObjectId) throw new Error('Please select an Object before saving.');
      const numberedStages = stages
        .filter(s => s.label?.trim())
        .map((s, i) => ({
          ...(s.id ? { id: s.id } : {}),
          label:       s.label.trim(),
          name:        s.name || s.label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          color:       s.color,
          order_index: i + 1,
          ...(s.config !== undefined ? { config: s.config && Object.keys(s.config).length ? s.config : null } : {}),
        }));

      if (enabledViews.length === 0) throw new Error('Enable at least one view (Table, Card, or Pipeline).');

      // Keep a stable, known order so the runtime toggle is predictable.
      const orderedViews = ALL_VIEWS.filter(v => enabledViews.includes(v));

      const payload = {
        label:       formData.label,
        name:        editing?.name || formData.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        description: formData.description,
        object_id:   Number(selectedObjectId),
        // Merge so keys this form does not edit survive a save.
        config:      { ...(fullPipelineData?.data?.config || editing?.config || {}), enabled_views: orderedViews, delete_mode: softDelete ? 'soft' : 'hard' },
        stages:      numberedStages,
      };

      return editing
        ? builderService.updatePipelineWithStages(editing.id, payload)
        : builderService.createPipeline(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] });
      qc.invalidateQueries({ queryKey: ['pipeline-full', editing?.id] });
      onClose();
      if (!editing) onSaved?.(res.data);
    },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });

  const stagesValid = stages.filter(s => s.label?.trim()).length > 0;
  const viewsValid  = enabledViews.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Pipeline' : 'New Pipeline'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit(d => saveMutation.mutate(d))}
            loading={saveMutation.isPending}
            disabled={!stagesValid || !viewsValid}
          >
            Save Pipeline
          </Button>
        </div>
      }
    >
      {formError && <Alert variant="error" className="mb-4">{formError}</Alert>}

      <div className="space-y-4">
        {/* Name */}
        {/* The asterisk used to be decorative: the field was registered with no
            rule, so `errors.label` could never populate and an empty name
            reached the server. */}
        <Input
          label="Pipeline Name" required
          error={errors.label?.message}
          {...register('label', { required: 'A pipeline needs a name' })}
        />

        {/* Module → Object */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Module <span className="text-red-500">*</span>
            </label>
            <select
              className={selectCls}
              value={selectedModuleId}
              onChange={e => { setSelectedModuleId(e.target.value); setSelectedObjectId(''); }}
            >
              <option value="">— Select Module —</option>
              {allModules.map(m => (
                <option key={m.id} value={m.id}>{m.label || m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Object <span className="text-red-500">*</span>
            </label>
            <select
              className={selectCls}
              value={selectedObjectId}
              onChange={e => setSelectedObjectId(e.target.value)}
              disabled={!selectedModuleId}
            >
              <option value="">— Select Object —</option>
              {allObjects.map(o => (
                <option key={o.id} value={o.id}>{o.label || o.name}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedObjectId && (
          <p className="text-xs text-green-600 -mt-2">
            ✓ The view toggle (the views you tick below) will appear on the <strong>{allObjects.find(o => String(o.id) === selectedObjectId)?.label}</strong> tab
          </p>
        )}

        <TextArea label="Description" {...register('description')} rows={2} />

        {/* Views available at runtime */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Views on the module page
            <span className="ml-1 text-xs text-gray-400">(tick the views users can switch between)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {VIEW_OPTIONS.map(opt => {
              const checked = enabledViews.includes(opt.key);
              return (
                <label
                  key={opt.key}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={() => toggleView(opt.key)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 dark:text-white/80">{opt.label}</span>
                    <span className="block text-[11px] text-gray-400 leading-4">{opt.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!viewsValid && (
            <p className="mt-1 text-xs text-red-500">Enable at least one view.</p>
          )}
        </div>

        {/* Delete mode (per-pipeline) */}
        <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Deletion behaviour</span>
            <Badge variant={softDelete ? 'success' : 'secondary'} className="ml-auto">
              {softDelete ? 'Soft — recoverable' : 'Hard — permanent'}
            </Badge>
          </div>
          <Toggle
            id="pipeline-delete-mode"
            checked={softDelete}
            onChange={setSoftDelete}
            label="Soft delete (move to Trash)"
            description={
              softDelete
                ? 'Deleted records are hidden from users but kept in the Trash for admin recovery.'
                : 'Deleted records are permanently removed and cannot be recovered.'
            }
          />
        </div>

        {/* Stages */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Pipeline Stages
              <span className="ml-1 text-xs text-gray-400">(left to right order)</span>
            </label>
            <Button size="xs" variant="secondary" type="button" onClick={handleAddStage}>
              <Plus className="w-3 h-3 mr-1" /> Add Stage
            </Button>
          </div>

          {stages.length === 0 && (
            <p className="text-sm text-gray-400 italic py-3 text-center border border-dashed border-gray-200 dark:border-white/10 rounded-lg">
              No stages yet — click &ldquo;Add Stage&rdquo;
            </p>
          )}

          <div className="space-y-2">
            {stages.map((stage, i) => (
              <StageRow
                key={i}
                stage={stage}
                index={i}
                onChange={handleStageChange}
                onRemove={handleRemoveStage}
              />
            ))}
          </div>
        </div>

        {/* Live preview */}
        {stages.filter(s => s.label?.trim()).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
            <div className="flex gap-1.5 flex-wrap">
              {stages.filter(s => s.label?.trim()).map((stage, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                  style={{ background: stage.color }}
                >
                  {stage.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Pipeline audit trail (config change history) ───────────────────────────
const AUDIT_LABELS = {
  'pipeline.create': { label: 'Created',  cls: 'text-green-600 dark:text-green-400' },
  'pipeline.update': { label: 'Updated',  cls: 'text-blue-600 dark:text-blue-400' },
  'pipeline.delete': { label: 'Deleted',  cls: 'text-red-600 dark:text-red-400' },
};

function PipelineAuditPanel({ pipelineId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-audit', pipelineId],
    queryFn:  () => builderService.getPipelineAudit(pipelineId),
    enabled:  !!pipelineId,
  });
  const entries = data?.data || [];

  if (isLoading) return <p className="text-sm text-gray-400 py-6 text-center">Loading history…</p>;
  if (!entries.length) {
    return <p className="text-sm text-gray-400 py-6 text-center">No changes recorded yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-white/10 max-h-[60vh] overflow-y-auto">
      {entries.map((e) => {
        const meta = AUDIT_LABELS[e.action] || { label: e.action, cls: 'text-gray-500' };
        const who = e.employee?.employee_name || e.employee_id;
        const summary = e.changes?.fields?.length
          ? `Changed: ${e.changes.fields.join(', ')}`
          : e.changes?.stage_count != null
            ? `${e.changes.stage_count} stage(s)${e.changes?.delete_mode ? ` · ${e.changes.delete_mode} delete` : ''}`
            : null;
        return (
          <li key={e.id} className="py-2.5 flex items-start gap-3">
            <span className={`text-xs font-semibold w-16 shrink-0 ${meta.cls}`}>{meta.label}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700 dark:text-white/70">
                <span className="font-medium">{who}</span>
                {summary && <span className="text-gray-400"> — {summary}</span>}
              </p>
              <p className="text-[11px] text-gray-400">{new Date(e.created_at).toLocaleString()}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Pipeline list page ─────────────────────────────────────────────────────
export default function PipelineBuilderPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [permTarget, setPermTarget] = useState(null); // pipeline row for permissions modal
  const [historyTarget, setHistoryTarget] = useState(null); // pipeline row for audit history modal

  const { data, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn:  () => builderService.getPipelines(),
  });
  const pipelines = data?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => builderService.deletePipeline(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pipelines'] }),
  });

  const openNew  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setModalOpen(true); };

  const columns = [
    {
      key: 'label', header: 'Pipeline Name', sortable: true,
      render: (v, row) => v || row.name,
    },
    {
      key: 'object', header: 'Linked Object',
      render: (v, row) => {
        if (row.object) {
          return (
            <span className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-gray-400 text-xs mr-1">{row.object.module?.label || ''} /</span>
              {row.object.label || row.object.name}
            </span>
          );
        }
        return <span className="text-xs text-gray-400 italic">Not linked</span>;
      },
    },
    {
      key: 'stages', header: 'Stages',
      render: (v) => {
        const stages = v || [];
        return (
          <div className="flex gap-1 flex-wrap">
            {stages.map(s => (
              <span
                key={s.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                style={{ background: s.color }}
              >
                {s.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'is_active', header: 'Status',
      render: v => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'id', header: '',
      render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <button title="History" onClick={() => setHistoryTarget(row)} className="p-1 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded">
            <History className="w-4 h-4 text-blue-400" />
          </button>
          <button title="Permissions" onClick={() => setPermTarget(row)} className="p-1 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded">
            <Shield className="w-4 h-4 text-purple-400" />
          </button>
          <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded">
            <Pencil className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={() => deleteMutation.mutate(row.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded">
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <PageHeader
        icon={Kanban}
        eyebrow="Builder"
        title="Pipeline Builder"
        subtitle="Link ordered stages to an object to unlock Table, Card, and Kanban views."
        className="!mb-4"
        actions={(
          <div className="flex items-center gap-2">
            <Link to="/builder/trash">
              <Button variant="secondary">
                <Trash2 className="w-4 h-4 mr-1.5" />Trash
              </Button>
            </Link>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-1.5" />New Pipeline
            </Button>
          </div>
        )}
      />

      <BuilderGuide section="/builder/pipeline" />

      {/* Explanation banner */}
      <div className="mb-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-medium mb-1">What is a Pipeline?</p>
        <p className="text-blue-700 text-xs leading-5">
          A pipeline links a set of ordered stages to an <strong>Object</strong> (e.g. Lead).
          Once linked, a <strong>view toggle</strong> appears on that object&apos;s module page. Choose which
          views users can switch between — <strong>Table</strong>, <strong>Card</strong>, and
          <strong> Pipeline</strong> (Kanban) — using the checkboxes in the editor. Each stage becomes a
          column in the Pipeline view.
        </p>
      </div>

      <DataTable icon={Kanban} title="Pipelines" columns={columns} data={pipelines} loading={isLoading} />

      <PipelineModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={() => {}}
      />

      {/* Pipeline permissions modal */}
      <Modal
        isOpen={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.label || permTarget?.name || ''}`}
        size="md"
      >
        {permTarget && (
          <EntityPermissionPanel entityType="pipeline" entityId={permTarget.id} />
        )}
      </Modal>

      {/* Pipeline audit history modal */}
      <Modal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={`History — ${historyTarget?.label || historyTarget?.name || ''}`}
        size="md"
      >
        {historyTarget && <PipelineAuditPanel pipelineId={historyTarget.id} />}
      </Modal>
    </div>
  );
}
