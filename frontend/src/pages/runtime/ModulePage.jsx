import { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import { useMetadataStore } from '../../store/metadataStore';
import { useEntityStore } from '../../store/entityStore';
import Pipeline from '../../components/ui/Pipeline';
import LeadScoringInsights from '../../components/runtime/LeadScoringInsights';
import DataTable from '../../components/ui/DataTable';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import ActivityTimeline from '../../components/runtime/ActivityTimeline';
import TaskPanel from '../../components/runtime/TaskPanel';
import ReminderPanel from '../../components/runtime/ReminderPanel';
import DocumentPanel from '../../components/runtime/DocumentPanel';
import ClientDetails from '../../components/runtime/ClientDetails';
import FieldValue from '../../components/runtime/FieldValue';
import RelatedPanel from '../../components/runtime/RelatedPanel';
import RecordActions from '../../components/runtime/RecordActions';
import RecordMerge from '../../components/runtime/RecordMerge';
import { EmployeePicker } from '../../components/ui/EmployeePicker';
import { useAuthStore } from '../../store/authStore';
import { recordTitle, initials, gradientFor } from '../../utils/record';
import clsx from 'clsx';
import { fmtCurrency } from '../../utils/formatters';
import {
  Plus, LayoutList, Kanban, Wand2, Download, Upload, Trash2, X,
  History, Activity, CheckSquare, LayoutGrid, Edit, ImageOff, Mail, FileText,
  UserPlus, ArrowLeft, Bell, Link2,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Return a stable placeholder image URL seeded by record id */
function placeholderImg(id) {
  return `https://picsum.photos/seed/record-${id}/480/240`;
}

/** Detect an image field from the object's field list */
function findImageField(fields) {
  const IMAGE_KEYWORDS = ['image', 'photo', 'avatar', 'picture', 'logo', 'thumbnail', 'cover'];
  // `field_type` is the canonical property on a metadata field; the old `f.type`
  // was always undefined here, so an image field only matched when its NAME
  // happened to contain one of the keywords below.
  return fields.find(f =>
    f.field_type === 'image' ||
    IMAGE_KEYWORDS.some(kw => f.name?.toLowerCase().includes(kw))
  ) ?? null;
}

/* ─── RecordCardGrid ─────────────────────────────────────────────────────── */

function RecordCard({ record, fields, imageField, moduleId, objectId, onActivityClick, navigate, canEdit = true }) {
  const [imgError, setImgError] = useState(false);

  const title    = recordTitle(record.data) || `Record #${record.id}`;
  const imgSrc   = imageField ? record.data?.[imageField.name] : null;
  const heroSrc  = (imgSrc && !imgError) ? imgSrc : placeholderImg(record.id);
  const stage    = record.pipeline_stage;

  // Pick up to 3 fields (excluding name/title/image fields) for the card body
  const metaFields = fields
    .filter(f =>
      f.name !== imageField?.name &&
      !['full_name', 'first_name', 'last_name', 'name', 'title', 'label'].includes(f.name)
    )
    .slice(0, 3);

  return (
    <div
      className="card group flex flex-col overflow-hidden cursor-pointer hover:shadow-card-md transition-all duration-150 hover:-translate-y-0.5"
      onClick={() => onActivityClick(record)}
    >
      {/* ── Hero image ── */}
      <div className="relative h-36 overflow-hidden shrink-0 bg-gray-100 dark:bg-white/10">
        <img
          src={heroSrc}
          alt={title}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Stage pill — bottom-left of hero */}
        {stage && (
          <span
            className="absolute bottom-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
            style={{ background: stage.color || 'rgb(var(--pc-500))' }}
          >
            {stage.label}
          </span>
        )}

        {/* Action buttons — top-right, visible on hover */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onActivityClick(record); }}
            title="Activity"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors"
          >
            <Activity className="h-3 w-3" />
          </button>
          {canEdit && (
            <button
              onClick={e => {
                e.stopPropagation();
                navigate(`/module/${moduleId}/object/${objectId}/edit/${record.id}`);
              }}
              title="Edit"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors"
            >
              <Edit className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        {/* Avatar + title */}
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(record.id)} text-white text-[10px] font-bold shadow-xs`}>
            {initials(title)}
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate" title={title}>
            {title}
          </p>
        </div>

        {/* Meta fields */}
        {metaFields.length > 0 && (
          <div className="space-y-1 mt-0.5">
            {metaFields.map(f => {
              const val = record.data?.[f.name];
              if (val === null || val === undefined || val === '') return null;
              return (
                <div key={f.name} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400 truncate shrink-0">{f.label}</span>
                  <span className="text-[11px] text-gray-700 dark:text-gray-300 truncate text-right">
                    {f.field_type === 'currency' || f.name === 'annual_revenue'
                      ? fmtCurrency(val)
                      : String(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordCardGrid({ records, fields, moduleId, objectId, onActivityClick, navigate, loading, canEdit = true }) {
  const imageField = useMemo(() => findImageField(fields), [fields]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/10 mb-3">
          <ImageOff className="h-6 w-6 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No records yet</p>
        <p className="text-xs text-gray-400 mt-1">Create a record to see it here</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 animate-fade-in">
      {records.map(record => (
        <RecordCard
          key={record.id}
          record={record}
          fields={fields}
          imageField={imageField}
          moduleId={moduleId}
          objectId={objectId}
          onActivityClick={onActivityClick}
          navigate={navigate}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

/* ─── Lead grade colors (A–F) — shared by list column + Kanban card badge ── */
const GRADE_COLORS = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

/* ─── View toggle ────────────────────────────────────────────────────────── */

const VIEW_META = {
  table:    { icon: LayoutList, label: 'Table'    },
  cards:    { icon: LayoutGrid, label: 'Cards'    },
  pipeline: { icon: Kanban,     label: 'Pipeline' },
};

function ViewToggle({ viewMode, setViewMode, views }) {
  const options = (views || []).map(key => ({ key, ...VIEW_META[key] })).filter(o => o.icon);
  if (options.length <= 1) return null;  // nothing to toggle between

  return (
    <div className="inline-flex h-9 items-center gap-0.5 rounded-lg bg-gray-100 dark:bg-white/[0.06] p-1">
      {options.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          title={label}
          onClick={() => setViewMode(key)}
          className={clsx(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-all',
            viewMode === key
              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/[0.04] dark:bg-white/10 dark:text-white dark:ring-white/10'
              : 'text-gray-500 hover:text-gray-800 dark:text-white/50 dark:hover:text-white/80',
          )}
        >
          <Icon className="w-4 h-4" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ModulePage() {
  const { moduleId, objectId } = useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode]         = useState('table');
  const [selectedIds, setSelectedIds]   = useState(() => new Set());
  const [activeRecord, setActiveRecord] = useState(null);
  // Deep link: `?record=<id>` opens that record's panel (used by related lists
  // and notifications), whatever page of the list it is on.
  const [searchParams] = useSearchParams();
  const deepLinkId = Number(searchParams.get('record')) || null;
  useEffect(() => {
    if (!deepLinkId) return undefined;
    let cancelled = false;
    runtimeService.getRecord(deepLinkId)
      .then((res) => { if (!cancelled) setActiveRecord(res?.data ?? res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [deepLinkId]);
  const [sideTab, setSideTab]           = useState('activity');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showConvertToProspectModal, setShowConvertToProspectModal] = useState(false);
  const [stageError, setStageError] = useState(null);

  // ── 1. Module + objects (MetadataStore → fallback to API) ─────────────────
  const cachedModule = useMetadataStore((s) => s.getModule(moduleId));
  const { data: moduleData, isLoading: moduleLoading } = useQuery({
    queryKey: ['runtime-module', moduleId],
    queryFn:  () => runtimeService.getModule(moduleId),
    enabled:  !!moduleId && !cachedModule,
  });
  const module  = cachedModule ?? moduleData?.data;
  // objects used by JSX tabs — stable ref derived from module
  const objects  = useMemo(() => module?.objects ?? [], [module]);

  const activeObject = useMemo(() => {
    const objs = module?.objects ?? [];
    if (!objs.length) return null;
    return objectId
      ? objs.find(o => String(o.id) === String(objectId)) ?? objs[0]
      : objs[0];
  }, [module, objectId]);

  // Write access on the active object. The backend attaches `_can_edit` per
  // object (admins → true; roles without an explicit edit permission → false).
  // View-only roles must not see create/import/delete actions, otherwise the
  // POST /records call is rejected with a 403 after the user fills the form.
  const canEdit = activeObject?._can_edit !== false;

  // ── 2. Pipeline (MetadataStore → fallback to API) ─────────────────────────
  const cachedObjectData = useMetadataStore((s) => activeObject?.id ? s.getObject(Number(activeObject.id)) : null);
  const { data: objectData } = useQuery({
    queryKey: ['runtime-object', activeObject?.id],
    queryFn:  () => runtimeService.getObject(activeObject.id),
    enabled:  !!activeObject?.id && !cachedObjectData,
  });
  const resolvedObjectData = cachedObjectData ?? objectData?.data;
  const activePipeline = (resolvedObjectData?.pipelines || [])[0] ?? null;

  const { data: pipelineData } = useQuery({
    queryKey: ['runtime-pipeline', activePipeline?.id],
    queryFn:  () => runtimeService.getPipeline(activePipeline.id),
    enabled:  !!activePipeline?.id,
  });
  const pipeline = pipelineData?.data;

  // Which views the module page offers, honoring the pipeline's enabled_views
  // config (set in Pipeline Builder). Pipeline view is only possible when a
  // pipeline exists. Falls back to all available views when unconfigured, and
  // never resolves to an empty set.
  const availableViews = useMemo(() => {
    const base = ['table', 'cards', ...(activePipeline ? ['pipeline'] : [])];
    const enabled = (pipeline ?? activePipeline)?.config?.enabled_views;
    if (Array.isArray(enabled) && enabled.length) {
      const filtered = base.filter(v => enabled.includes(v));
      return filtered.length ? filtered : base;
    }
    return base;
  }, [activePipeline, pipeline]);

  const preferredView = availableViews.includes('pipeline') ? 'pipeline' : (availableViews[0] || 'table');

  // ── 3. Wizards ────────────────────────────────────────────────────────────
  const { data: wizardsData } = useQuery({
    queryKey: ['runtime-wizards', activeObject?.id],
    queryFn:  () => runtimeService.getWizards(activeObject.id),
    enabled:  !!activeObject?.id,
  });
  const objectWizards = wizardsData?.data || [];
  const objectFields   = useMemo(() => resolvedObjectData?.fields ?? [], [resolvedObjectData]);

  // ── Auto-redirects ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeObject || (!objectData && !cachedObjectData) || !wizardsData) return;
    if (objectWizards.length > 0 && !activePipeline) {
      navigate(`/wizard/${objectWizards[0].id}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObject?.id, objectData, cachedObjectData, wizardsData]);

  // Pick the default view when the object changes.
  useEffect(() => {
    if (!objectData && !cachedObjectData) return;
    setViewMode(preferredView);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObject?.id]);

  // Keep the current view valid if the available views change (e.g. the pipeline
  // config loads, or an admin disables the view that is currently selected).
  useEffect(() => {
    setViewMode(prev => (availableViews.includes(prev) ? prev : preferredView));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableViews]);

  // Clear selection + side panel when object changes
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveRecord(null);
  }, [activeObject?.id]);

  // ── 4. Records (sync EntityStore with React Query) ────────────────────────
  const queryClient = useQueryClient();
  const setEntityRecords = useEntityStore((s) => s.setRecords);
  const entityRecords = useEntityStore((s) => s.getRecords(activeObject?.id));
  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['runtime-records', activeObject?.id],
    queryFn:  async () => {
      const result = await runtimeService.getRecords(activeObject.id);
      // Sync to EntityStore for optimistic access across pages
      if (result?.data && activeObject?.id) {
        setEntityRecords(activeObject.id, result.data);
      }
      return result;
    },
    enabled:  !!activeObject?.id,
  });
  const records = useMemo(() => recordsData?.data ?? entityRecords ?? [], [recordsData, entityRecords]);

  const moveStage = useMutation({
    mutationFn: ({ id, stageId }) => runtimeService.updateRecordStage(id, stageId),
    onMutate: async ({ id, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['runtime-records', activeObject?.id] });
      const snapshot = queryClient.getQueryData(['runtime-records', activeObject?.id]);
      queryClient.setQueryData(['runtime-records', activeObject?.id], (prev) => {
        if (!prev?.data) return prev;
        return {
          ...prev,
          data: prev.data.map((r) =>
            r.id === id
              ? { ...r, pipeline_stage_id: stageId, pipeline_stage: pipelineStages.find((s) => Number(s.id) === Number(stageId)) ?? r.pipeline_stage }
              : r,
          ),
        };
      });
      return { snapshot };
    },
    onSuccess: (result) => {
      setStageError(null);
      const action = result?.data?.automation?.action;
      if (action === 'lead_converted') {
        // Lead was auto-converted — navigate to Clients module
        queryClient.invalidateQueries({ queryKey: ['runtime-records'] });
        const modules = queryClient.getQueryData(['runtime-modules'])?.data;
        const clientModule = modules?.find(m => m.name === 'clients');
        if (clientModule) navigate(`/module/${clientModule.id}`);
      }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['runtime-records', activeObject?.id], ctx.snapshot);
      setStageError(err?.response?.data?.error || 'Could not move this record.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] }),
  });

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const bulkDelete = useMutation({
    mutationFn: () => runtimeService.bulkDeleteRecords([...selectedIds]),
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] });
    },
  });

  // ── Bulk reassign (managers / admins — e.g. an RM leaving) ─────────────────
  const canReassign = useAuthStore((s) => s.isAdmin() || s.isManager());
  const [reassignTo, setReassignTo] = useState('');
  const bulkAssign = useMutation({
    mutationFn: () => runtimeService.bulkAssignRecords([...selectedIds], reassignTo || null),
    onSuccess: () => {
      setSelectedIds(new Set());
      setReassignTo('');
      queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] });
    },
  });

  const handleBulkDelete  = useCallback(() => {
    if (selectedIds.size === 0) return;
    bulkDelete.mutate();
  }, [bulkDelete, selectedIds.size]);

  // ── Object type detection ───────────────────────────────────────────────
  const isLeadObject        = activeObject?.name === 'lead' || activeObject?.name === 'prospect';
  const isLeadIntakeObject  = activeObject?.name === 'lead_intake';   // raw "Lead" object

  // ── Lead conversion ─────────────────────────────────────────────────────
  const convertLead = useMutation({
    mutationFn: (recordId) => runtimeService.convertLead(recordId, {
      create_account: true,
      create_contact: true,
      create_opportunity: true,
      opportunity_name: `${recordTitle(activeRecord?.data) || 'Lead'} - Opportunity`,
    }),
    onSuccess: (_result) => {
      setShowConvertModal(false);
      setActiveRecord(null);
      // Refresh prospect records to reflect converted status
      queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] });
      // Invalidate ALL record queries so the Clients module shows the new contact
      queryClient.invalidateQueries({ queryKey: ['runtime-records'] });

      // Navigate to the Clients module so the user sees their new client
      const modules = queryClient.getQueryData(['runtime-modules'])?.data;
      const clientModule = modules?.find(m => m.name === 'clients');
      if (clientModule) {
        navigate(`/module/${clientModule.id}`);
      }
    },
  });

  // ── Lead → Prospect conversion (raw Lead object) ─────────────────────────
  const convertToProspect = useMutation({
    mutationFn: (recordId) => runtimeService.convertToProspect(recordId),
    onSuccess: () => {
      setShowConvertToProspectModal(false);
      setActiveRecord(null);
      queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] });
      queryClient.invalidateQueries({ queryKey: ['runtime-records'] });
      // Navigate to the Prospects module so the user sees the new prospect
      const modules = queryClient.getQueryData(['runtime-modules'])?.data;
      const prospectModule = modules?.find(m => m.name === 'prospects');
      if (prospectModule) navigate(`/module/${prospectModule.id}`);
    },
  });

  const handleClearSelect = useCallback(() => setSelectedIds(new Set()), []);

  const handleExportCsv = useCallback(async () => {
    if (!activeObject?.id) return;
    try {
      const res = await runtimeService.exportRecordsCsv(activeObject.id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `${activeObject.name}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) { /* silent */ }
  }, [activeObject?.id, activeObject?.name]);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const allChecked = records.length > 0 && records.every(r => prev.has(r.id));
      return allChecked ? new Set() : new Set(records.map(r => r.id));
    });
  }, [records]);

  const handleActivityClick = useCallback((row) => {
    setActiveRecord(row);
    setSideTab(activeObject?.name === 'email_template' ? 'preview' : 'activity');
  }, [activeObject?.name]);

  // ── 5. Table columns ──────────────────────────────────────────────────────
  const tableColumns = useMemo(() => {
    const selCol = {
      key: '_select', label: '',
      render: (_, row) => (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary-600"
          checked={selectedIds.has(row.id)}
          onChange={(e) => {
            setSelectedIds(prev => {
              const next = new Set(prev);
              e.target.checked ? next.add(row.id) : next.delete(row.id);
              return next;
            });
          }}
          onClick={e => e.stopPropagation()}
        />
      ),
    };

    // Use fields explicitly marked "Show in List"; fall back to first 5 non-description fields
    const listFields = objectFields.filter(f => f.config?.show_in_list === true);
    const displayFields = listFields.length > 0
      ? listFields
      : objectFields.filter(f => !['description', 'full_name'].includes(f.name)).slice(0, 5);

    const fieldCols = displayFields
      .map(f => ({
        key:      f.name,
        label:    f.label,
        sortable: true,
        // Formatted from the field's metadata (type, options, lookup label) —
        // the same renderer the record panel uses.
        render:   (_, row) => <FieldValue field={f} value={row.data?.[f.name]} label={row.labels?.[f.name]} masked={row.masked?.includes(f.name)} recordId={row.id} compact />,
      }));

    if (pipeline) {
      fieldCols.push({
        key:    '_stage',
        label:  'Stage',
        render: (_, row) => {
          const stage = row.pipeline_stage;
          if (!stage) return <span className="text-gray-400">—</span>;
          return (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ background: stage.color || 'rgb(var(--n-500))' }}
            >
              {stage.label}
            </span>
          );
        },
      });
    }

    fieldCols.push({
      key: '_actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={() => handleActivityClick(row)}>
            <Activity className="w-3 h-3" />
          </Button>
          {canEdit && (
            <Button
              size="xs" variant="ghost"
              onClick={() => navigate(`/module/${moduleId}/object/${activeObject?.id}/edit/${row.id}`)}
            >
              Edit
            </Button>
          )}
        </div>
      ),
    });

    return canEdit ? [selCol, ...fieldCols] : fieldCols;
  }, [objectFields, pipeline, moduleId, activeObject, navigate, selectedIds, handleActivityClick, canEdit]);

  // ── 6. Pipeline stages + cards ────────────────────────────────────────────
  const pipelineStages = useMemo(() =>
    (pipeline?.stages || []).map(s => ({ id: s.id, label: s.label, color: s.color || 'rgb(var(--pc-500))' })),
    [pipeline],
  );

  // Resolve the active record's stage. The records list doesn't always embed the
  // pipeline_stage relation, so fall back to matching pipeline_stage_id against
  // the loaded stages — otherwise the 360° hero would show no stage badge.
  const activeStage = useMemo(() => {
    if (!activeRecord) return null;
    if (activeRecord.pipeline_stage) return activeRecord.pipeline_stage;
    const sid = activeRecord.pipeline_stage_id;
    return sid != null ? (pipelineStages.find(s => Number(s.id) === Number(sid)) ?? null) : null;
  }, [activeRecord, pipelineStages]);

  const pipelineCards = useMemo(() =>
    records.map(r => {
      const d = r.data ?? {};
      return {
        id:       r.id,
        stage_id: r.pipeline_stage_id ?? pipelineStages[0]?.id ?? null,
        title:    recordTitle(d) || `Record #${r.id}`,
        subtitle: d.case_number
                || d.product_type || d.company || d.email || '',
        // Lead grade badge (A–F) for quick triage on the board.
        badge: d.grade && GRADE_COLORS[d.grade]
          ? { label: d.grade, color: GRADE_COLORS[d.grade], title: d.score != null ? `Score ${d.score}` : undefined }
          : null,
      };
    }),
    [records, pipelineStages],
  );

  const handleCardMove = useCallback((cardId, newStageId) => {
    moveStage.mutate({ id: cardId, stageId: newStageId });
  }, [moveStage]);

  const newRecordPath = useMemo(() =>
    activeObject ? `/module/${moduleId}/object/${activeObject.id}/new` : `/module/${moduleId}/new`,
    [moduleId, activeObject],
  );

  const allChecked = useMemo(() =>
    records.length > 0 && records.every(r => selectedIds.has(r.id)),
    [records, selectedIds],
  );

  // ── Early returns ─────────────────────────────────────────────────────────
  if (moduleLoading) {
    return <div className="flex items-center justify-center h-full py-16"><Spinner size="xl" /></div>;
  }
  if (!module) {
    return <div className="p-6"><Alert variant="error">Module not found.</Alert></div>;
  }
  if (!activeObject) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{module.label}</h1>
        <Alert variant="info">No objects configured for this module yet.</Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Object tabs ──────────────────────────────────────────────────── */}
      {objects.length > 1 && (
        <div className="border-b border-gray-200/70 dark:border-white/[0.07] bg-white/80 dark:bg-night-1/80 backdrop-blur-xl px-4 py-2.5">
          <nav className="flex items-center gap-1 overflow-x-auto">
            {objects.map(obj => (
              <button
                key={obj.id}
                onClick={() => navigate(`/module/${moduleId}/object/${obj.id}`)}
                className={clsx(
                  'px-4 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap',
                  String(obj.id) === String(activeObject.id)
                    ? 'bg-gradient-to-br from-primary-500 to-mid text-on-primary shadow-sm shadow-primary-500/25'
                    : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5',
                )}
              >
                {obj.label || obj.name}
              </button>
            ))}
          </nav>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Main content ──────────────────────────────────────────────── */}
        <div className={clsx('flex-1 p-6 overflow-y-auto', activeRecord && 'hidden')}>
          {/* Header */}
          <div className="widget widget-accent aurora-wash px-5 py-4 mb-5 flex items-center justify-between flex-wrap gap-3 animate-slide-up">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="icon-chip h-11 w-11">
                <LayoutList className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-gray-900 dark:text-white truncate">
                  {activeObject.plural_label || activeObject.label || activeObject.name}
                </h1>
                <p className="text-sm text-gray-500 dark:text-white/40">
                  {recordsLoading ? 'Loading…' : `${records.length} record${records.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Bulk action bar */}
              {canEdit && selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-700">
                  <span className="text-xs font-medium text-primary-700 dark:text-primary-300">{selectedIds.size} selected</span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDelete.isPending}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                  {canReassign && (
                    <span className="flex items-center gap-1">
                      <EmployeePicker value={reassignTo} onChange={setReassignTo} placeholder="Reassign to…" wrapperClass="w-44" />
                      <button
                        onClick={() => reassignTo && bulkAssign.mutate()}
                        disabled={!reassignTo || bulkAssign.isPending}
                        className="text-xs font-medium text-primary-700 hover:underline disabled:opacity-50"
                      >
                        Reassign
                      </button>
                    </span>
                  )}
                  <button onClick={handleClearSelect} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* View toggle — always visible */}
              <ViewToggle
                viewMode={viewMode}
                setViewMode={setViewMode}
                views={availableViews}
              />

              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-white/60 hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-white/10 transition-colors"
                title="Export CSV"
              >
                <Download className="w-4 h-4" /> Export
              </button>

              {canEdit && (
                <button
                  onClick={() => navigate(`/import?object_id=${activeObject?.id}`)}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-white/60 hover:bg-gray-50 hover:border-gray-300 dark:hover:bg-white/10 transition-colors"
                  title="Import CSV"
                >
                  <Upload className="w-4 h-4" /> Import
                </button>
              )}

              {canEdit && (
                <Button onClick={() => {
                  const defaultStageId = viewMode === 'pipeline' && pipelineStages.length ? pipelineStages[0].id : null;
                  navigate(defaultStageId ? `${newRecordPath}?stage_id=${defaultStageId}` : newRecordPath);
                }}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  New {activeObject.label || activeObject.name}
                </Button>
              )}

              {canEdit && objectWizards.length > 0 && (
                <Button variant="secondary" onClick={() => navigate(`/wizard/${objectWizards[0].id}`)}>
                  <Wand2 className="w-4 h-4 mr-1.5" />
                  {objectWizards[0].label || objectWizards[0].name}
                </Button>
              )}
            </div>
          </div>

          {/* Select-all row (table view only) */}
          {viewMode === 'table' && records.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600"
                checked={allChecked}
                onChange={toggleAll}
              />
              <span className="text-xs text-gray-500 dark:text-white/40">Select all</span>
            </div>
          )}

          {/* ── Email Template hint ── */}
          {activeObject?.name === 'email_template' && records.length > 0 && !activeRecord && (
            <div className="flex items-center gap-2.5 mb-3 px-4 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-800/40 text-xs text-primary-700 dark:text-primary-300">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Click on any email template row to preview how the email will appear to recipients.</span>
            </div>
          )}

          {/* Stage-move / conversion blocked (e.g. required fields incomplete) */}
          {stageError && (
            <div className="mb-4">
              <Alert variant="error" onClose={() => setStageError(null)}>{stageError}</Alert>
            </div>
          )}

          {/* Lead scoring insights — analytics for the Leads module only */}
          {isLeadIntakeObject && <LeadScoringInsights />}

          {/* ── Content area ── */}
          {viewMode === 'pipeline' && pipelineStages.length ? (
            <Pipeline
              stages={pipelineStages}
              cards={pipelineCards}
              onCardClick={(card) => {
                const rec = records.find(r => r.id === card.id);
                if (rec) handleActivityClick(rec);
              }}
              onCardEdit={canEdit ? (card) => navigate(`/module/${moduleId}/object/${activeObject?.id}/edit/${card.id}`) : undefined}
              onCardMove={canEdit ? handleCardMove : undefined}
              onAddCard={canEdit ? (stageId) => navigate(`${newRecordPath}?stage_id=${stageId}`) : undefined}
            />
          ) : viewMode === 'cards' ? (
            <RecordCardGrid
              records={records}
              fields={objectFields}
              moduleId={moduleId}
              objectId={activeObject?.id}
              onActivityClick={handleActivityClick}
              navigate={navigate}
              loading={recordsLoading}
              canEdit={canEdit}
            />
          ) : (
            <div className="card">
              <DataTable frame={false}
                columns={tableColumns}
                data={records}
                loading={recordsLoading}
                onRowClick={(row) => handleActivityClick(row)}
                emptyText={canEdit
                  ? `No ${(activeObject.plural_label || activeObject.label || activeObject.name).toLowerCase()} yet. Click "New ${activeObject.label || activeObject.name}" to add one.`
                  : `No ${(activeObject.plural_label || activeObject.label || activeObject.name).toLowerCase()} yet.`}
              />
            </div>
          )}
        </div>

        {/* ── 360° Record Detail (full-screen takeover) ────────────────────── */}
        {activeRecord && (
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-night-0">
            {/* Sticky glass header bar */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-night-1/80 backdrop-blur-xl">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setActiveRecord(null)}
                  title="Back"
                  className="inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border border-gray-200 dark:border-white/10 text-gray-500 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-white/80 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className={clsx(
                  'hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white text-sm font-bold shadow-sm ring-2 ring-white dark:ring-night-1',
                  gradientFor(activeRecord.id),
                )}>
                  {initials(recordTitle(activeRecord.data) || `#${activeRecord.id}`)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                    {recordTitle(activeRecord.data) || `Record #${activeRecord.id}`}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-white/30 truncate flex items-center gap-1.5">
                    {activeStage?.label ? (
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ background: activeStage.color || 'rgb(var(--pc-500))' }}
                      />
                    ) : null}
                    {activeStage?.label || activeObject.label}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {isLeadObject && !activeRecord.data?.is_converted && (
                  <Button size="xs" variant="primary" onClick={() => setShowConvertModal(true)}>
                    <UserPlus className="w-3 h-3 mr-1" />
                    Convert
                  </Button>
                )}
                {isLeadIntakeObject && !activeRecord.data?.is_converted && (
                  <Button size="xs" variant="primary" onClick={() => setShowConvertToProspectModal(true)}>
                    <UserPlus className="w-3 h-3 mr-1" />
                    Convert to Prospect
                  </Button>
                )}
                {canEdit && <RecordActions objectId={activeObject?.id} recordId={activeRecord.id} />}
                {canEdit && <RecordMerge objectName={activeObject?.name} recordId={activeRecord.id} onMerged={() => setActiveRecord?.(null)} />}
                {canEdit && (
                  <Button
                    size="xs" variant="ghost"
                    onClick={() => navigate(`/module/${moduleId}/object/${activeObject?.id}/edit/${activeRecord.id}`)}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
                <button
                  onClick={() => setActiveRecord(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable body: client details, then Activity/Tasks/Docs/Audit */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-6xl mx-auto p-6 space-y-6">
                {/* 1. Filled-in client details */}
                <ClientDetails
                  record={activeRecord}
                  fields={objectFields}
                  object={activeObject}
                  stage={activeStage}
                />

                {/* 2. Activity / Tasks / Docs / Audit — modern segmented tabs */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm overflow-hidden">
                  <div className="px-4 pt-4">
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-gray-100/80 dark:bg-white/[0.04] p-1">
                      {[
                        { key: 'related',   icon: Link2,       label: 'Related'   },
                        { key: 'activity',  icon: Activity,    label: 'Activity'  },
                        { key: 'tasks',     icon: CheckSquare, label: 'Tasks'     },
                        { key: 'reminders', icon: Bell,        label: 'Reminders' },
                        { key: 'docs',      icon: FileText,    label: 'Docs'      },
                        { key: 'audit',     icon: History,     label: 'Audit'     },
                        ...(activeObject?.name === 'email_template'
                          ? [{ key: 'preview', icon: Mail, label: 'Preview' }]
                          : []),
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setSideTab(tab.key)}
                          className={clsx(
                            'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                            sideTab === tab.key
                              ? 'bg-white dark:bg-white/10 text-primary-600 dark:text-primary-300 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10'
                              : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70',
                          )}
                        >
                          <tab.icon className="w-4 h-4" />
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-5">
                    {sideTab === 'activity' && (
                      <ActivityTimeline
                        recordId={activeRecord.id}
                        objectId={activeObject?.id}
                        relatedType={activeObject?.name}
                        recordData={activeRecord.data}
                        defaultToEmail={activeRecord.data?.email || activeRecord.data?.contact_email || ''}
                      />
                    )}
                    {sideTab === 'tasks'     && <TaskPanel recordId={activeRecord.id} />}
                    {sideTab === 'reminders' && <ReminderPanel recordId={activeRecord.id} />}
                    {sideTab === 'docs'     && <DocumentPanel recordId={activeRecord.id} relatedType={activeObject?.name} />}
                    {sideTab === 'audit'    && <AuditTab recordId={activeRecord.id} />}
                    {sideTab === 'related'  && <RelatedPanel recordId={activeRecord.id} />}
                    {sideTab === 'preview'  && <EmailPreviewTab record={activeRecord} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Convert Lead Modal ──────────────────────────────────────────── */}
      {showConvertModal && activeRecord && createPortal((
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none">
          <div className="relative w-full max-w-md bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Convert Lead to Client
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This will convert <strong>{recordTitle(activeRecord.data) || `Record #${activeRecord.id}`}</strong> into:
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1.5 mb-6 ml-4 list-disc">
              <li>A <strong>Client Account</strong> (company/household)</li>
              <li>A <strong>Contact</strong> (individual person)</li>
              <li>An <strong>Opportunity</strong> (sales pipeline entry)</li>
            </ul>
            {convertLead.isError && (
              <Alert variant="error" className="mb-4">
                {convertLead.error?.response?.data?.error || convertLead.error?.message || 'Conversion failed'}
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowConvertModal(false)}
                disabled={convertLead.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => convertLead.mutate(activeRecord.id)}
                disabled={convertLead.isPending}
              >
                {convertLead.isPending ? 'Converting...' : 'Convert'}
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ── Convert Lead → Prospect Modal ───────────────────────────────── */}
      {showConvertToProspectModal && activeRecord && createPortal((
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none">
          <div className="relative w-full max-w-md bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Convert Lead to Prospect
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This qualifies <strong>{recordTitle(activeRecord.data) || `Record #${activeRecord.id}`}</strong> and
              creates a <strong>Prospect</strong> in the sales pipeline. The lead is marked converted.
            </p>
            {convertToProspect.isError && (
              <Alert variant="error" className="mb-4">
                {convertToProspect.error?.response?.data?.error || convertToProspect.error?.message || 'Conversion failed'}
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowConvertToProspectModal(false)}
                disabled={convertToProspect.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => convertToProspect.mutate(activeRecord.id)}
                disabled={convertToProspect.isPending}
              >
                {convertToProspect.isPending ? 'Converting...' : 'Convert to Prospect'}
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

// ── Email Preview Tab ────────────────────────────────────────────────────────
function EmailPreviewTab({ record }) {
  const subject  = record?.data?.subject  ?? null;
  const bodyHtml = record?.data?.body_html ?? null;
  const bodyText = record?.data?.body_text ?? null;

  const [tab, setTab] = useState('html');

  if (!bodyHtml && !bodyText) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mail className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-xs text-gray-400">No email body found for this template.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Subject preview */}
      {subject && (
        <div className="bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-wide mb-0.5">Subject</p>
          <p className="text-xs font-medium text-gray-800 dark:text-white/80">{subject}</p>
        </div>
      )}

      {/* HTML / Text toggle */}
      <div className="flex gap-1 bg-gray-100 dark:bg-white/[0.06] rounded-lg p-0.5">
        {bodyHtml && (
          <button
            onClick={() => setTab('html')}
            className={clsx(
              'flex-1 text-xs py-1 rounded-md font-medium transition-colors',
              tab === 'html'
                ? 'bg-white dark:bg-white/10 text-gray-800 dark:text-white/90 shadow-sm'
                : 'text-gray-500 dark:text-white/40',
            )}
          >
            HTML Preview
          </button>
        )}
        {bodyText && (
          <button
            onClick={() => setTab('text')}
            className={clsx(
              'flex-1 text-xs py-1 rounded-md font-medium transition-colors',
              tab === 'text'
                ? 'bg-white dark:bg-white/10 text-gray-800 dark:text-white/90 shadow-sm'
                : 'text-gray-500 dark:text-white/40',
            )}
          >
            Plain Text
          </button>
        )}
      </div>

      {/* Preview area */}
      {tab === 'html' && bodyHtml && (
        <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-white/[0.03] px-3 py-1.5 border-b border-gray-200 dark:border-white/10">
            <p className="text-[10px] text-gray-400 dark:text-white/30 font-medium uppercase tracking-wide">Email Render Preview</p>
          </div>
          <iframe
            title="Email HTML Preview"
            srcDoc={bodyHtml}
            sandbox="allow-same-origin"
            className="w-full border-0"
            style={{ height: '480px' }}
          />
        </div>
      )}

      {tab === 'text' && bodyText && (
        <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-white/[0.03] px-3 py-1.5 border-b border-gray-200 dark:border-white/10">
            <p className="text-[10px] text-gray-400 dark:text-white/30 font-medium uppercase tracking-wide">Plain Text Version</p>
          </div>
          <pre className="p-3 text-xs text-gray-700 dark:text-white/70 whitespace-pre-wrap font-sans leading-relaxed overflow-y-auto max-h-[480px]">
            {bodyText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Inline AuditTab ──────────────────────────────────────────────────────────
function AuditTab({ recordId }) {
  const { data, isLoading } = useQuery({
    queryKey:  ['audit', recordId],
    queryFn:   () => runtimeService.getRecordAudit(recordId).then(r => r.data ?? []),
    enabled:   !!recordId,
    staleTime: 60_000,
  });

  const logs = data ?? [];
  // Map an audit action to a short label + chip colour. Handles the record-level
  // actions (create/update/delete/stage_change) and the entity-level events
  // logged for activities, tasks and documents (e.g. activity_create, task_delete).
  const auditMeta = (action = '') => {
    if (action === 'create')        return { label: 'Created', color: 'text-green-600  bg-green-50   dark:bg-green-950/20' };
    if (action === 'update')        return { label: 'Updated', color: 'text-blue-600   bg-blue-50    dark:bg-blue-950/20' };
    if (action === 'delete')        return { label: 'Deleted', color: 'text-red-600    bg-red-50     dark:bg-red-950/20' };
    if (action === 'stage_change')  return { label: 'Stage',   color: 'text-violet-600 bg-violet-50  dark:bg-violet-950/20' };
    if (action.endsWith('_create')) return { label: 'Added',   color: 'text-green-600  bg-green-50   dark:bg-green-950/20' };
    if (action.endsWith('_delete')) return { label: 'Deleted', color: 'text-red-600    bg-red-50     dark:bg-red-950/20' };
    return { label: action.replace('_', ' '), color: 'text-gray-500 bg-gray-50' };
  };

  if (isLoading) return <p className="text-xs text-gray-400 text-center py-8">Loading…</p>;
  if (!logs.length) return <p className="text-xs text-gray-400 text-center py-8">No audit history yet.</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">Change History</h3>
      {logs.map(log => {
        const meta = auditMeta(log.action);
        return (
        <div key={log.id} className="flex gap-3 text-xs">
          <span className={clsx('shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize h-fit', meta.color)}>
            {meta.label}
          </span>
          <div className="min-w-0">
            <p className="text-gray-500 dark:text-white/40">
              {log.employee?.employee_name ?? 'System'}
              {' · '}
              {new Date(log.created_at).toLocaleString()}
            </p>
            {/* Entity events (activity/task/document) carry a human-readable summary */}
            {log.changes?.summary && (
              <p className="text-gray-600 dark:text-white/60 mt-0.5 truncate">{log.changes.summary}</p>
            )}
            {/* Record field updates carry a { field: { old, new } } diff */}
            {log.action === 'update' && log.changes && !log.changes.summary && (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(log.changes).map(([field, { old: o, new: n }]) => (
                  <li key={field} className="text-gray-400 dark:text-white/30 truncate">
                    <span className="font-medium text-gray-600 dark:text-white/50">{field}</span>:&nbsp;
                    <span className="line-through text-red-400">{String(o ?? '—')}</span>&nbsp;→&nbsp;
                    <span className="text-green-600 dark:text-green-400">{String(n ?? '—')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
