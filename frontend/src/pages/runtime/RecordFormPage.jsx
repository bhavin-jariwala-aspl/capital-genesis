import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runtimeService, metadataService } from '../../services/metadata.service';
import { useMetadataStore } from '../../store/metadataStore';
import { useEntityStore } from '../../store/entityStore';
import FormRenderer from '../../components/runtime/FormRenderer';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import { ArrowLeft, Wand2, Mail, Monitor, AlignLeft, FileText } from 'lucide-react';
import * as Icons from 'lucide-react';

/** Wide field types that should span the full row */
const FULL_WIDTH_TYPES = new Set(['textarea', 'richtext', 'json', 'text_area', 'long_text']);

/**
 * Build a usable FormRenderer-compatible formMeta directly from an object's
 * raw field list when no designer-built form exists for the object.
 */
function buildAutoFormMeta(objectFields) {
  const visible = objectFields.filter(f => f.name !== 'id');
  let row = 0;
  let col = 0;

  const fields = visible.map((f, i) => {
    const fullWidth = FULL_WIDTH_TYPES.has(f.type);
    const col_span  = fullWidth ? 12 : 6;

    const entry = {
      ...f,
      field_name: f.name,
      col_span,
      position: i,
      row,
      col,
    };

    // Advance grid cursor
    if (fullWidth || col === 1) {
      row += 1;
      col  = 0;
    } else {
      col += 1;
    }

    return entry;
  });

  return { id: null, name: 'auto', columns: 2, fields, dependencies: [] };
}

/** Convert raw field_layouts → FormRenderer shape (fallback for non-cached forms) */
function normaliseFormMeta(rawForm) {
  if (!rawForm) return null;
  const unitWidth = 12 / (rawForm.columns || 2);
  const fields = (rawForm.field_layouts || [])
    .sort((a, b) => a.order_index - b.order_index)
    .filter(fl => fl.is_visible !== false)
    .map(fl => {
      // A layout may override how the field appears on THIS form only
      // (label, placeholder, help text, read-only) without touching the field.
      const o = fl.config && typeof fl.config === 'object' ? fl.config : {};
      return {
        ...fl.field,
        ...(o.label ? { label: o.label } : {}),
        ...(o.placeholder !== undefined ? { placeholder: o.placeholder } : {}),
        ...(o.help_text !== undefined ? { help_text: o.help_text } : {}),
        config:     { ...(fl.field.config || {}), ...(o.read_only ? { always_disabled: true } : {}), ...(o.appearance || {}) },
        field_name: fl.field.name,
        col_span:   Math.round(fl.col_span * unitWidth),
        position:   fl.order_index,
        row:        fl.row,
        col:        fl.col,
      };
    });
  return { ...rawForm, fields, dependencies: rawForm.dependencies || [] };
}

export default function RecordFormPage() {
  const { moduleId, objectId, recordId } = useParams();
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit    = !!recordId;
  const queryClient = useQueryClient();

  // ── Try MetadataStore first (instant, from local cache) ─────────
  const cachedModule = useMetadataStore((s) => s.getModule(moduleId));
  const cachedObject = useMetadataStore((s) => {
    if (!objectId && cachedModule?.objects?.length) return s.getObject(cachedModule.objects[0].id);
    return objectId ? s.getObject(Number(objectId)) : null;
  });

  // ── Fallback: Load module from server if not cached ─────────────
  const { data: moduleData, isLoading: moduleLoading } = useQuery({
    queryKey: ['runtime-module', moduleId],
    queryFn:  () => runtimeService.getModule(moduleId),
    enabled:  !!moduleId && !cachedModule,
  });

  const module  = cachedModule ?? moduleData?.data;
  const activeObject = useMemo(() => {
    if (cachedObject) return cachedObject;
    const objects = module?.objects || [];
    if (!objects.length) return null;
    return objectId
      ? objects.find(o => String(o.id) === String(objectId)) ?? objects[0]
      : objects[0];
  }, [module, objectId, cachedObject]);

  // ── Try cached form from MetadataStore ──────────────────────────
  const cachedFormMeta = useMetadataStore((s) => {
    if (!activeObject?.id) return null;
    return s.getFormForObject(activeObject.id, isEdit ? 'edit' : 'create');
  });

  // ── Fallback: Find the form via API if not cached ───────────────
  const { data: formsData, isLoading: formsLoading, isFetching: formsFetching } = useQuery({
    queryKey: ['forms', activeObject?.id],
    queryFn:  () => metadataService.getForms(activeObject.id),
    enabled:  !!activeObject?.id && !cachedFormMeta,
  });
  const createForm = useMemo(() => {
    if (cachedFormMeta) return null; // Already have it
    const list = formsData?.data || [];
    return list.find(f => f.form_type === (isEdit ? 'edit' : 'create')) ?? list[0] ?? null;
  }, [formsData, isEdit, cachedFormMeta]);

  // ── Fallback: Load full form metadata (with field_layouts) ──────
  const { data: fullFormData, isLoading: formLoading } = useQuery({
    queryKey: ['runtime-form', createForm?.id],
    queryFn:  () => runtimeService.getForm(createForm.id),
    enabled:  !!createForm?.id && !cachedFormMeta,
  });
  // useMemo must run unconditionally on every render (rules of hooks) — compute
  // first, then fall back to the cached form metadata when available.
  const computedFormMeta = useMemo(() => normaliseFormMeta(fullFormData?.data), [fullFormData]);
  const formMeta = cachedFormMeta ?? computedFormMeta;

  // ── Fallback: fetch raw object fields when no designer form exists
  const noConfiguredForm = !cachedFormMeta && !!formsData && !formsLoading && !formsFetching && !createForm;

  const cachedObjectFields = cachedObject?.fields;
  const { data: objectData, isLoading: objectFieldsLoading } = useQuery({
    queryKey: ['runtime-object', activeObject?.id],
    queryFn:  () => runtimeService.getObject(activeObject.id),
    enabled:  !!activeObject?.id && noConfiguredForm && !cachedObjectFields?.length,
  });
  const autoFormMeta = useMemo(() => {
    if (!noConfiguredForm) return null;
    const fields = cachedObjectFields || objectData?.data?.fields || [];
    return fields.length > 0 ? buildAutoFormMeta(fields) : null;
  }, [noConfiguredForm, objectData, cachedObjectFields]);

  // ── The form to actually render (cached > designer form > auto-form)
  const resolvedFormMeta = formMeta ?? autoFormMeta;

  // ── Load existing record data (edit mode only)
  const { data: recordData, isLoading: recordLoading } = useQuery({
    queryKey: ['runtime-record', recordId],
    queryFn:  () => runtimeService.getRecord(recordId),
    enabled:  isEdit && !!recordId,
  });
  const existingValues = recordData?.data?.data ?? {};

  // ── Back path
  const backPath = objectId
    ? `/module/${moduleId}/object/${objectId}`
    : `/module/${moduleId}`;

  // ── Submit — with optimistic update support ─────────────────────
  const addOptimisticRecord = useEntityStore((s) => s.addOptimisticRecord);
  const confirmOptimisticRecord = useEntityStore((s) => s.confirmOptimisticRecord);
  const rollbackOptimisticRecord = useEntityStore((s) => s.rollbackOptimisticRecord);

  const saveMutation = useMutation({
    mutationFn: (formData) => {
      if (isEdit) {
        return runtimeService.updateRecord(recordId, formData);
      }
      const stageId = searchParams.get('stage_id');
      return runtimeService.createRecord({
        object_id: activeObject?.id,
        data:      formData,
        ...(stageId ? { stage_id: Number(stageId) } : {}),
      });
    },
    onMutate: (formData) => {
      // Optimistic: add record to entity store for instant UI feedback
      if (!isEdit && activeObject?.id) {
        const tempId = addOptimisticRecord(activeObject.id, {
          data: formData,
          object_id: activeObject.id,
          created_at: new Date().toISOString(),
        });
        return { tempId };
      }
    },
    onSuccess: (result, _formData, context) => {
      // Replace optimistic record with server response
      if (context?.tempId && activeObject?.id) {
        confirmOptimisticRecord(activeObject.id, context.tempId, result?.data);
      }
      queryClient.invalidateQueries({ queryKey: ['runtime-records', activeObject?.id] });
      navigate(backPath);
    },
    onError: (_err, _formData, context) => {
      // Rollback optimistic record on failure
      if (context?.tempId && activeObject?.id) {
        rollbackOptimisticRecord(activeObject.id, context.tempId);
      }
    },
  });

  // ── Derived breadcrumb label
  const objectLabel = activeObject?.label || activeObject?.name || '…';
  const pageTitle   = isEdit ? `Edit ${objectLabel}` : `New ${objectLabel}`;

  // ── Loading states: only show spinner if we don't have cached data
  const isLoadingMetadata = !cachedModule && moduleLoading;

  if (isLoadingMetadata) {
    return <div className="flex items-center justify-center h-full"><Spinner size="xl" /></div>;
  }
  if (!module) {
    return <div className="p-6"><Alert variant="error">Module not found.</Alert></div>;
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
      {/* ── Top bar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white/80 dark:bg-night-2 backdrop-blur-sm border-b border-gray-200/60 dark:border-white/10 shrink-0">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {activeObject?.plural_label || activeObject?.label || module?.label}
        </button>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{pageTitle}</span>
      </div>

      {/* ── Form area */}
      <div className="flex-1 overflow-y-auto py-8 px-6">
        <div className="max-w-4xl mx-auto">
          {/* Compact header with gradient accent */}
          <div className="relative mb-6 px-5 py-3.5 rounded-xl bg-gradient-to-r from-primary-600 via-mid to-accent-600 shadow-md shadow-primary-500/15 overflow-hidden">
            <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="relative flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                {(() => {
                  const IconComp = Icons[activeObject?.icon] || Icons[module?.icon] || FileText;
                  return <IconComp className="w-4.5 h-4.5 text-white" />;
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {module?.label && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary-200/80">
                      {module.label}
                    </span>
                  )}
                  {module?.label && <span className="text-white/30 text-xs">/</span>}
                  <h1 className="text-base font-bold text-white truncate">{pageTitle}</h1>
                </div>
                {activeObject?.description && (
                  <p className="text-xs text-primary-100/80 mt-0.5 truncate">{activeObject.description}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-night-2 rounded-2xl shadow-sm ring-1 ring-gray-900/5 p-8">
            {(!cachedFormMeta && (formLoading || formsLoading || formsFetching || objectFieldsLoading)) || (isEdit && recordLoading) ? (
              <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
            ) : resolvedFormMeta ? (
              <>
                {/* Subtle banner when using the auto-generated form */}
                {autoFormMeta && !formMeta && (
                  <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                    <Wand2 className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>
                      Using an auto-generated form. For a custom layout go to{' '}
                      <a href="/builder/form" className="font-semibold underline underline-offset-2 hover:text-amber-900">
                        Builder → Form Builder
                      </a>.
                    </span>
                  </div>
                )}
                <FormRenderer
                  formMeta={resolvedFormMeta}
                  recordId={isEdit ? recordId : undefined}
                  defaultValues={existingValues}
                  onSubmit={(data) => saveMutation.mutate(data)}
                  onCancel={() => navigate(backPath)}
                  loading={saveMutation.isPending}
                  serverErrors={saveMutation.error?.response?.data?.error?.details}
                  submitLabel={isEdit ? 'Save Changes' : `Create ${objectLabel}`}
                />
              </>
            ) : (
              <Alert variant="warning">
                No fields are defined for {objectLabel} yet.
                Go to{' '}
                <a href="/builder/modules" className="font-semibold underline underline-offset-2">
                  Builder → Modules &amp; Objects
                </a>{' '}
                to add fields first.
              </Alert>
            )}

            {saveMutation.isError && (() => {
              const apiErr = saveMutation.error?.response?.data?.error;
              const details = Array.isArray(apiErr?.details) ? apiErr.details : [];
              return (
                <Alert variant="error" className="mt-4">
                  {apiErr?.message || saveMutation.error?.response?.data?.message || saveMutation.error?.message || 'Failed to save.'}
                  {details.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-xs space-y-0.5">
                      {details.map((d) => <li key={d.field}>{d.message}</li>)}
                    </ul>
                  )}
                </Alert>
              );
            })()}
          </div>

          {/* ── Email Preview Section (email_template only) ── */}
          {activeObject?.name === 'email_template' && isEdit && existingValues?.body_html && (
            <EmailPreviewSection values={existingValues} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Email Preview Section ─────────────────────────────────────────────── */
function EmailPreviewSection({ values }) {
  const [tab, setTab] = useState('html');

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-primary-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Email Preview</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">How this email will appear to recipients</p>
        </div>
      </div>

      <div className="bg-white dark:bg-night-2 rounded-2xl shadow-sm border border-gray-100 dark:border-white/[0.07] overflow-hidden">
        {/* Subject bar */}
        {values.subject && (
          <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.03]">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-0.5 shrink-0 w-14">Subject</span>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{values.subject}</span>
          </div>
        )}

        {/* Tab toggle */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-100 dark:border-white/[0.07]">
          <button
            onClick={() => setTab('html')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'html'
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            HTML Preview
          </button>
          {values.body_text && (
            <button
              onClick={() => setTab('text')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === 'text'
                  ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white/80 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5" />
              Plain Text
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 italic">Variables shown as-is — replace with real data at send time</span>
        </div>

        {/* Preview body */}
        {tab === 'html' ? (
          <iframe
            key="html-preview"
            title="Email HTML Preview"
            srcDoc={values.body_html}
            sandbox="allow-same-origin"
            className="w-full border-0 block"
            style={{ minHeight: '600px' }}
          />
        ) : (
          <pre className="px-8 py-6 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 dark:bg-white/[0.03] min-h-[300px]">
            {values.body_text}
          </pre>
        )}
      </div>
    </div>
  );
}
