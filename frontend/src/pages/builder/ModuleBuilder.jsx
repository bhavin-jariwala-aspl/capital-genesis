import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metadataService } from '../../services/metadata.service';
import { useForm } from 'react-hook-form';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import TextArea from '../../components/ui/TextArea';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import { EntityPermissionPanel } from '../../components/builder/PermissionPanel';
import { Plus, ChevronRight, Pencil, Trash2, Shield, Box, Database, Columns3 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { FIELD_TYPES, MODULE_CATEGORY_OPTIONS, categoryLabel } from '../../utils/constants';
import { accessService } from '../../services/access.service';
import { invalidateMetadata } from '../../utils/invalidate';
import { apiErrorText } from '../../utils/record';
import OptionReplacementDialog, { parseValuesInUse, optionChoices } from '../../components/builder/OptionReplacementDialog';

// ─── Field type options ──────────────────────────────────────────────────────
const FIELD_TYPE_OPTIONS = FIELD_TYPES.map(ft => ({ value: ft.field_type, label: ft.label }));

// ─── Reusable confirm delete hook ────────────────────────────────────────────
function useDeleteConfirm() {
  const [target, setTarget] = useState(null);
  return { target, ask: setTarget, clear: () => setTarget(null) };
}

// ─── Module section ──────────────────────────────────────────────────────────
function ModulesSection({ onSelectModule }) {
  const qc = useQueryClient();
  const delConfirm = useDeleteConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [permTarget, setPermTarget] = useState(null); // { id, label } for permissions modal
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const { data, isLoading } = useQuery({ queryKey: ['modules'], queryFn: () => metadataService.getModules() });
  const modules = data?.data || [];

  // Every save here also refreshes runtime metadata (navigation, record pages
  // and forms read modules/objects/fields from MetadataStore first).
  const saveMutation = useMutation({
    mutationFn: (d) => editing ? metadataService.updateModule(editing.id, d) : metadataService.createModule(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); invalidateMetadata(qc); setModalOpen(false); },
    onError: (e) => setFormError(apiErrorText(e)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteModule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); invalidateMetadata(qc); setDeleteError(null); },
    onError: (e) => setDeleteError(apiErrorText(e)),
  });

  const openCreate = () => { setEditing(null); reset({ category: 'crm' }); setFormError(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); reset(row); setFormError(null); setModalOpen(true); };

  const columns = [
    { key: 'label', header: 'Name', sortable: true },
    { key: 'name', header: 'Key', render: v => <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 rounded">{v}</code> },
    { key: 'icon', header: 'Icon' },
    { key: 'category', header: 'Category', render: v => <Badge variant="secondary">{categoryLabel(v)}</Badge> },
    { key: 'is_active', header: 'Status', render: v => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', header: '', render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => onSelectModule(row)} className="text-primary-600 hover:underline text-sm flex items-center gap-1">
            Objects <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded" title="Edit"><Pencil className="w-4 h-4 text-gray-500" /></button>
          <button onClick={() => setPermTarget(row)} className="p-1 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded" title="Permissions"><Shield className="w-4 h-4 text-primary-400" /></button>
          <button onClick={() => delConfirm.ask(row)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={Box}
        eyebrow="Builder"
        title="Modules & Objects"
        subtitle="Define the modules, objects, and fields that power every screen."
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />New Module</Button>}
      />

      <BuilderGuide section="/builder/modules" />
      <DataTable icon={Box} title="Modules" columns={columns} data={modules} loading={isLoading} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Module' : 'New Module'}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="module-form" loading={isSubmitting}>Save</Button></div>}>
        {formError && <Alert variant="error" className="mb-3">{formError}</Alert>}
        <form id="module-form" onSubmit={handleSubmit(d => saveMutation.mutate({ ...d, is_active: d.is_active === 'true' || d.is_active === true }))} className="space-y-3">
          <Input label="Label (Display Name) *" error={errors.label?.message} {...register('label', { required: 'Required' })} />
          <Input label="Name (Key) *" placeholder="snake_case" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Icon" placeholder="e.g. Users" {...register('icon')} />
          <Input label="Category (sidebar section)" placeholder="e.g. crm, lending, compliance" list="module-category-options"
            help="Pick a section or type a new one — every category becomes its own sidebar group."
            {...register('category')} />
          <datalist id="module-category-options">
            {[...new Set([...MODULE_CATEGORY_OPTIONS.map((o) => o.value), ...modules.map((m) => m.category).filter(Boolean)])]
              .map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </datalist>
          <Input label="Description" {...register('description')} />
          <Select label="Status" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} {...register('is_active')} />
        </form>
      </Modal>

      {/* Permissions modal */}
      <Modal
        isOpen={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.label ?? ''}`}
        size="md"
        footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setPermTarget(null)}>Close</Button></div>}
      >
        <EntityPermissionPanel entityType="module" entityId={permTarget?.id} />
      </Modal>

      {deleteError && <Alert variant="error" className="mt-3" onClose={() => setDeleteError(null)}>{deleteError}</Alert>}

      <Modal isOpen={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Module?" size="sm"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={delConfirm.clear}>Cancel</Button><Button variant="danger" loading={deleteMutation.isPending} onClick={() => { deleteMutation.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button></div>}>
        <p className="text-gray-600 dark:text-gray-400">Delete module <strong>{delConfirm.target?.name}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  );
}

// ─── Objects section ─────────────────────────────────────────────────────────
function ObjectsSection({ module, onBack, onSelectObject }) {
  const qc = useQueryClient();
  const delConfirm = useDeleteConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [permTarget, setPermTarget] = useState(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const { data, isLoading } = useQuery({ queryKey: ['objects', module.id], queryFn: () => metadataService.getObjects(module.id) });
  const objects = data?.data || [];
  const { data: zoneData } = useQuery({ queryKey: ['barrier-zones'], queryFn: () => accessService.getZones(), staleTime: 60_000 });
  const zones = zoneData?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: (d) => {
      // Drop blank record settings so an untouched form never writes empty keys.
      const config = Object.fromEntries(Object.entries({ ...(editing?.config ?? {}), ...(d.config ?? {}) }).filter(([, v]) => v !== '' && v != null));
      const body = { ...d, config: Object.keys(config).length ? config : null };
      return editing ? metadataService.updateObject(editing.id, body) : metadataService.createObject({ ...body, module_id: module.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objects', module.id] }); invalidateMetadata(qc); setModalOpen(false); },
    onError: (e) => setFormError(apiErrorText(e)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteObject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objects', module.id] }); invalidateMetadata(qc); setDeleteError(null); },
    onError: (e) => setDeleteError(apiErrorText(e)),
  });

  const openCreate = () => { setEditing(null); reset({}); setFormError(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); reset(row); setFormError(null); setModalOpen(true); };

  const columns = [
    { key: 'label', header: 'Name', sortable: true },
    { key: 'name', header: 'Key', render: v => <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 rounded">{v}</code> },
    { key: 'is_active', header: 'Status', render: v => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', header: '', render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => onSelectObject(row)} className="text-primary-600 hover:underline text-sm flex items-center gap-1">
            Fields <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded" title="Edit"><Pencil className="w-4 h-4 text-gray-500" /></button>
          <button onClick={() => setPermTarget(row)} className="p-1 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded" title="Permissions"><Shield className="w-4 h-4 text-primary-400" /></button>
          <button onClick={() => delConfirm.ask(row)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded" title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-primary-600 hover:underline text-sm">← Modules</button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{module.name} — Objects</h2>
        <Button size="sm" onClick={openCreate} className="ml-auto"><Plus className="w-4 h-4 mr-1.5" />New Object</Button>
      </div>
      <DataTable icon={Database} title="Objects" columns={columns} data={objects} loading={isLoading} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Object' : 'New Object'}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="object-form" loading={isSubmitting}>Save</Button></div>}>
        {formError && <Alert variant="error" className="mb-3">{formError}</Alert>}
        <form id="object-form" onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-3">
          <Input label="Label (Display Name) *" error={errors.label?.message} {...register('label', { required: 'Required' })} />
          <Input label="Name (Key) *" placeholder="snake_case" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <Input label="Plural label" placeholder="e.g. Loan Applications" {...register('plural_label')} />
          <TextArea label="Description" {...register('description')} rows={2} />
          <fieldset className="space-y-3 rounded-xl border border-gray-200 dark:border-white/10 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Record settings</legend>
            <Input label="Title field" placeholder="e.g. display_name" help="API name of the field shown as each record's name in lookups, related lists and search."
              {...register('config.title_field')} />
            <Input label="Business unit field" placeholder="e.g. business_unit" help="API name of a field holding a business-unit code. Records are then visible only to that unit's members (admins excepted)."
              {...register('config.business_unit_field')} />
            <Select label="Information barrier" options={[{ value: '', label: 'None' }, ...zones.map((z) => ({ value: z.code, label: `${z.name} (${z.code})` }))]}
              help="Every record of this object sits behind this barrier: only zone members and Compliance can see it — admins included."
              {...register('config.barrier_zone')} />
            <Input label="Barrier zone field" placeholder="e.g. visibility_zone" help="Or: API name of a field holding a zone code, so only some records are walled off. A value in this field wins; the barrier above is the fallback."
              {...register('config.barrier_zone_field')} />
          </fieldset>
        </form>
      </Modal>

      {/* Permissions modal */}
      <Modal
        isOpen={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.label ?? ''}`}
        size="md"
        footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setPermTarget(null)}>Close</Button></div>}
      >
        <EntityPermissionPanel entityType="object" entityId={permTarget?.id} />
      </Modal>

      {deleteError && <Alert variant="error" className="mt-3" onClose={() => setDeleteError(null)}>{deleteError}</Alert>}

      <Modal isOpen={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Object?" size="sm"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={delConfirm.clear}>Cancel</Button><Button variant="danger" loading={deleteMutation.isPending} onClick={() => { deleteMutation.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button></div>}>
        <p className="text-gray-600 dark:text-gray-400">Delete object <strong>{delConfirm.target?.name}</strong>? All fields, forms, and pipelines within it will also be deleted.</p>
      </Modal>
    </div>
  );
}

// ─── Fields section ───────────────────────────────────────────────────────────
/** `{ usages, records_with_value }` for a field, or null while unknown (no id, loading, failed). */
function useFieldUsages(fieldId) {
  const { data } = useQuery({
    queryKey: ['field-usages', fieldId],
    queryFn: () => metadataService.getFieldUsages(fieldId),
    enabled: !!fieldId,
    staleTime: 0,
    retry: false,
  });
  return fieldId ? data?.data ?? null : null;
}

function UsageList({ usages }) {
  return (
    <ul className="mt-1 list-disc pl-5 text-xs">
      {usages.map((u) => <li key={u}>{u}</li>)}
    </ul>
  );
}

function FieldsSection({ object, onBack }) {
  const qc = useQueryClient();
  const delConfirm = useDeleteConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const { data, isLoading } = useQuery({ queryKey: ['fields', object.id], queryFn: () => metadataService.getFields(object.id) });
  const fields = data?.data || [];

  // A save refused because removed picklist values are still held by records:
  // { payload, conflicts } until the admin maps them to remaining values.
  const [optionConflict, setOptionConflict] = useState(null);
  const saveMutation = useMutation({
    mutationFn: (d) => editing ? metadataService.updateField(editing.id, d) : metadataService.createField({ ...d, object_id: object.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields', object.id] }); invalidateMetadata(qc); setOptionConflict(null); setModalOpen(false); },
    onError: (e, d) => {
      const values = editing ? parseValuesInUse(e) : null;
      if (values) {
        setOptionConflict({ payload: d, conflicts: [{ key: 'field', label: d.label, values, options: optionChoices(d.options ?? editing.options) }] });
        return;
      }
      setOptionConflict(null);
      setFormError(apiErrorText(e));
    },
  });
  // What refers to the field being edited or deleted (formulas, gates, rules,
  // workflows, widgets): the API refuses a rename or delete while any do.
  const editUsages = useFieldUsages(modalOpen ? editing?.id : null);
  const deleteUsages = useFieldUsages(delConfirm.target?.id);
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteField(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields', object.id] }); invalidateMetadata(qc); setDeleteError(null); },
    onError: (e) => setDeleteError(apiErrorText(e)),
  });

  const openCreate = () => { setEditing(null); reset({ is_required: false, is_readonly: false, show_in_list: false, col_span: 6 }); setFormError(null); setModalOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    reset({ ...row, is_readonly: row.config?.always_disabled ?? false, show_in_list: row.config?.show_in_list ?? false });
    setFormError(null);
    setModalOpen(true);
  };

  const columns = [
    { key: 'label', header: 'Label', sortable: true },
    { key: 'name', header: 'Field Name', render: v => <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 rounded">{v}</code> },
    { key: 'field_type', header: 'Type', render: v => <Badge>{v}</Badge> },
    { key: 'is_required', header: 'Required', render: v => v ? '✓' : '—' },
    { key: 'config', header: 'In List', render: v => v?.show_in_list ? <span className="text-primary-600 font-medium">✓</span> : <span className="text-gray-300">—</span> },
    { key: 'col_span', header: 'Cols' },
    {
      key: 'id', header: '', render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => openEdit(row)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
          <button onClick={() => delConfirm.ask(row)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-primary-600 hover:underline text-sm">← Objects</button>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{object.name} — Fields</h2>
        <Button size="sm" onClick={openCreate} className="ml-auto"><Plus className="w-4 h-4 mr-1.5" />New Field</Button>
      </div>
      <DataTable icon={Columns3} title="Fields" columns={columns} data={fields} loading={isLoading} />

      {deleteError && <Alert variant="error" className="mt-3" onClose={() => setDeleteError(null)}>{deleteError}</Alert>}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Field' : 'New Field'} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="field-form" loading={isSubmitting}>Save</Button></div>}>
        {formError && <Alert variant="error" className="mb-3">{formError}</Alert>}
        {editUsages?.usages?.length > 0 && (
          <Alert variant="warning" className="mb-3">
            <p>The API name <code>{editing?.name}</code> cannot change while these use it (the label can):</p>
            <UsageList usages={editUsages.usages} />
          </Alert>
        )}
        <form id="field-form" onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="grid grid-cols-2 gap-3">
          <Input label="Label *" error={errors.label?.message} {...register('label', { required: 'Required' })} />
          <Input label="Name (Key) *" placeholder="snake_case" error={errors.name?.message} {...register('name', { required: 'Required' })} />
          <div className="col-span-2">
            <Select label="Field Type *" options={FIELD_TYPE_OPTIONS} {...register('field_type', { required: 'Required' })} />
          </div>
          <Input label="Placeholder" {...register('placeholder')} />
          <Input label="Default Value" {...register('default_value')} />
          <Input label="Col Span (1-12)" type="number" {...register('col_span', { min: 1, max: 12, valueAsNumber: true })} />
          <Input label="Position" type="number" {...register('position', { valueAsNumber: true })} />
          <div className="flex items-center gap-4 col-span-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('is_required')} className="rounded" /> Required
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('is_readonly')} className="rounded" /> Read-only
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('is_active')} className="rounded" /> Active
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register('show_in_list')} className="rounded" /> Show in List
            </label>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!delConfirm.target} onClose={delConfirm.clear} title="Delete Field?" size="sm"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={delConfirm.clear}>Cancel</Button><Button variant="danger" loading={deleteMutation.isPending} disabled={deleteUsages?.usages?.length > 0} onClick={() => { deleteMutation.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button></div>}>
        <p className="text-gray-600 dark:text-gray-400">Delete field <strong>{delConfirm.target?.label}</strong>?</p>
        {deleteUsages?.usages?.length > 0 && (
          <Alert variant="warning" className="mt-3">
            <p>It cannot be deleted while these use it — remove the references first, or deactivate the field:</p>
            <UsageList usages={deleteUsages.usages} />
          </Alert>
        )}
        {deleteUsages?.records_with_value > 0 && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{deleteUsages.records_with_value} record{deleteUsages.records_with_value === 1 ? ' holds' : 's hold'} a value in this field.</p>
        )}
      </Modal>

      <OptionReplacementDialog
        conflicts={optionConflict?.conflicts}
        saving={saveMutation.isPending}
        error={optionConflict ? formError : null}
        onCancel={() => setOptionConflict(null)}
        onConfirm={(choices) => { setFormError(null); saveMutation.mutate({ ...optionConflict.payload, option_replacements: choices.field }); }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ModuleBuilder() {
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);

  if (selectedObject) {
    return (
      <div className="p-6">
        <FieldsSection object={selectedObject} onBack={() => setSelectedObject(null)} />
      </div>
    );
  }

  if (selectedModule) {
    return (
      <div className="p-6">
        <ObjectsSection module={selectedModule} onBack={() => setSelectedModule(null)} onSelectObject={setSelectedObject} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <ModulesSection onSelectModule={setSelectedModule} />
    </div>
  );
}
