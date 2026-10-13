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
import { FIELD_TYPES, MODULE_CATEGORY_OPTIONS } from '../../utils/constants';

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

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? metadataService.updateModule(editing.id, d) : metadataService.createModule(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); setModalOpen(false); },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteModule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['modules'] }); setDeleteError(null); },
    onError: (e) => setDeleteError(e.response?.data?.error?.message || e.response?.data?.message || e.message),
  });

  const openCreate = () => { setEditing(null); reset({ category: 'crm' }); setFormError(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); reset(row); setFormError(null); setModalOpen(true); };

  const columns = [
    { key: 'label', header: 'Name', sortable: true },
    { key: 'name', header: 'Key', render: v => <code className="text-xs bg-gray-100 dark:bg-white/10 px-1 rounded">{v}</code> },
    { key: 'icon', header: 'Icon' },
    { key: 'category', header: 'Category', render: v => <Badge variant="secondary">{v || 'crm'}</Badge> },
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
          <Select label="Category" options={MODULE_CATEGORY_OPTIONS} {...register('category')} />
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

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? metadataService.updateObject(editing.id, d) : metadataService.createObject({ ...d, module_id: module.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objects', module.id] }); setModalOpen(false); },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteObject(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['objects', module.id] }); setDeleteError(null); },
    onError: (e) => setDeleteError(e.response?.data?.error?.message || e.response?.data?.message || e.message),
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
          <TextArea label="Description" {...register('description')} rows={2} />
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

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? metadataService.updateField(editing.id, d) : metadataService.createField({ ...d, object_id: object.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields', object.id] }); setModalOpen(false); },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => metadataService.deleteField(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields', object.id] }); setDeleteError(null); },
    onError: (e) => setDeleteError(e.response?.data?.error?.message || e.response?.data?.message || e.message),
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
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={delConfirm.clear}>Cancel</Button><Button variant="danger" loading={deleteMutation.isPending} onClick={() => { deleteMutation.mutate(delConfirm.target.id); delConfirm.clear(); }}>Delete</Button></div>}>
        <p className="text-gray-600 dark:text-gray-400">Delete field <strong>{delConfirm.target?.label}</strong>?</p>
      </Modal>
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
