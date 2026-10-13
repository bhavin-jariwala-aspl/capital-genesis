import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import { metadataService } from '../../services/metadata.service';
import { colors } from '../../utils/theme';
import WizardBuilder from '../../components/builder/WizardBuilder';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import TextArea from '../../components/ui/TextArea';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { Plus, Pencil, Trash2, Shield, Wand2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { EntityPermissionPanel } from '../../components/builder/PermissionPanel';

const selectCls = 'block w-full rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white/80 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:disabled:bg-white/[0.02] disabled:text-gray-400 dark:disabled:text-white/20';

function WizardFormModal({ isOpen, onClose, editing, onSaved }) {
  const qc = useQueryClient();
  const [formError, setFormError] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  // ── Module / Object options ──────────────────────────────
  const { data: modulesData } = useQuery({
    queryKey: ['modules'],
    queryFn: () => metadataService.getModules(),
  });
  const allModules = modulesData?.data || [];

  const { data: objectsData } = useQuery({
    queryKey: ['objects', selectedModuleId],
    queryFn: () => metadataService.getObjects(selectedModuleId),
    enabled: !!selectedModuleId,
  });
  const allObjects = objectsData?.data || [];

  // Hydrate selectors when editing an existing wizard
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      reset(editing);
      // object.module includes module_id in the select
      const objModuleId = editing.object?.module?.id ?? editing.object?.module_id ?? '';
      setSelectedModuleId(objModuleId ? String(objModuleId) : '');
      setSelectedObjectId(editing.object_id ? String(editing.object_id) : '');
    } else {
      reset({});
      setSelectedModuleId('');
      setSelectedObjectId('');
    }
    setFormError(null);
  }, [isOpen, editing, reset]);

  // Clear object selection when module changes
  const handleModuleChange = (e) => {
    setSelectedModuleId(e.target.value);
    setSelectedObjectId('');
  };

  const saveMutation = useMutation({
    mutationFn: (formData) => {
      const payload = {
        ...formData,
        object_id: selectedObjectId ? Number(selectedObjectId) : null,
        // For new wizards, auto-generate a snake_case name from the label
        ...(!editing && {
          name: formData.label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        }),
      };
      return editing
        ? builderService.updateWizard(editing.id, payload)
        : builderService.createWizard(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['wizards'] });
      onClose();
      if (!editing) onSaved(res.data);
    },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Wizard' : 'New Wizard'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="wiz-form" loading={isSubmitting || saveMutation.isPending}>Save</Button>
        </div>
      }
    >
      {formError && <Alert variant="error" className="mb-3">{formError}</Alert>}
      <form id="wiz-form" onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-3">
        <Input label="Name *" error={errors.label?.message} {...register('label', { required: 'Required' })} />

        {/* ── Module → Object association ─────────────────── */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">
            Module <span className="text-xs text-gray-400">(determines which module page shows this wizard)</span>
          </label>
          <select className={selectCls} value={selectedModuleId} onChange={handleModuleChange}>
            <option value="">— Select Module —</option>
            {allModules.map(m => (
              <option key={m.id} value={m.id}>{m.label || m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-1">
            Object <span className="text-xs text-gray-400">(the wizard button appears on this object&apos;s tab)</span>
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
          {selectedObjectId && (
            <p className="text-xs text-green-600 mt-1">
              ✓ Wizard button will appear on the <strong>{allObjects.find(o => String(o.id) === selectedObjectId)?.label}</strong> tab
            </p>
          )}
        </div>

        <Input label="Submit Label" placeholder="Submit" {...register('submit_label')} />
        <Input label="Success Message" placeholder="Thank you!" {...register('success_message')} />
        <TextArea label="Description" {...register('description')} rows={2} />
      </form>
    </Modal>
  );
}

function WizardList({ onSelect }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [permTarget, setPermTarget] = useState(null); // wizard row for permissions modal

  const { data, isLoading } = useQuery({
    queryKey: ['wizards'],
    queryFn: () => builderService.getWizards(),
  });
  const wizards = data?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => builderService.deleteWizard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wizards'] }),
  });

  const openNew  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setModalOpen(true); };

  const columns = [
    { key: 'label', header: 'Name', sortable: true, render: (v, row) => v || row.name },
    {
      key: 'object',
      header: 'Linked Object',
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
    { key: 'submit_label', header: 'Submit Label' },
    { key: 'is_active', header: 'Status', render: v => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', header: '', render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <Button size="xs" variant="ghost" onClick={() => onSelect(row)}>Open</Button>
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
      <PageHeader
        icon={Wand2}
        eyebrow="Builder"
        title="Wizard Builder"
        subtitle="Build multi-step, form-driven flows that capture records for an object."
        actions={(
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-1.5" />New Wizard
          </Button>
        )}
      />

      <BuilderGuide section="/builder/wizard" />

      <DataTable icon={Wand2} title="Wizards" columns={columns} data={wizards} loading={isLoading} />

      <WizardFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSaved={onSelect}
      />

      {/* Wizard permissions modal */}
      <Modal
        isOpen={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.label || permTarget?.name || ''}`}
        size="md"
      >
        {permTarget && (
          <EntityPermissionPanel entityType="wizard" entityId={permTarget.id} />
        )}
      </Modal>
    </div>
  );
}

export default function WizardBuilderPage() {
  const [selectedWizard, setSelectedWizard] = useState(null);

  if (selectedWizard) {
    return (
      <div className="h-full flex flex-col">
        <div className={`px-4 py-3 ${colors.border.primary} border-b flex items-center gap-3 ${colors.bg.primary}`}>
          <button onClick={() => setSelectedWizard(null)} className="text-primary-600 hover:underline text-sm">← Wizards</button>
          <span className="text-gray-400 dark:text-white/30">/</span>
          <span className="font-medium text-gray-800 dark:text-white/80">{selectedWizard.label}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <WizardBuilder wizardId={selectedWizard.id} wizardData={selectedWizard} />
        </div>
      </div>
    );
  }

  return <WizardList onSelect={setSelectedWizard} />;
}
