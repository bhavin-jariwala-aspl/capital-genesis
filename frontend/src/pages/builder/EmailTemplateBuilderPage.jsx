import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Mail, Eye, Variable,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { emailService } from '../../services/email.service';
import { runtimeService } from '../../services/metadata.service';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { confirmDialog } from '../../utils/dialog';

/* ─── Constants ─────────────────────────────────────────────────── */

const CATEGORIES = [
  { value: 'sales',       label: 'Sales' },
  { value: 'marketing',   label: 'Marketing' },
  { value: 'support',     label: 'Support' },
  { value: 'onboarding',  label: 'Onboarding' },
  { value: 'welcome',     label: 'Welcome' },
  { value: 'newsletter',  label: 'Newsletter' },
  { value: 'follow_up',   label: 'Follow Up' },
  { value: 'other',       label: 'Other' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
];

const CATEGORY_COLORS = {
  sales: 'primary', marketing: 'purple', support: 'warning',
  onboarding: 'success', welcome: 'info', newsletter: 'default',
  follow_up: 'warning', other: 'default',
};

const emptyForm = () => ({
  name: '', category: 'sales', object_id: '',
  subject: '', body_html: '', body_text: '',
  language: 'en', is_active: true,
});

/* ─── Variable Picker ─────────────────────────────────────────── */

function VariablePicker({ objectId, onInsert }) {
  const { data, isLoading } = useQuery({
    queryKey: ['template-fields', objectId],
    queryFn:  () => emailService.getTemplateFields(objectId).then(r => r.data ?? r),
    enabled:  !!objectId,
  });

  const fields = data?.fields ?? [];
  const systemVars = data?.system_variables ?? [];

  if (!objectId) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 dark:border-white/10 p-4 text-center">
        <Variable className="w-5 h-5 text-gray-300 mx-auto mb-1" />
        <p className="text-xs text-gray-400">Select an object above to see available fields</p>
      </div>
    );
  }

  if (isLoading) return <p className="text-xs text-gray-400 py-2">Loading fields…</p>;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
      <div className="bg-violet-50 dark:bg-violet-500/10 px-3 py-2 border-b border-gray-200 dark:border-white/10">
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
          <Variable className="w-3.5 h-3.5" /> Click a field to insert into your template
        </p>
      </div>
      <div className="p-2 max-h-48 overflow-y-auto">
        {fields.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">Object Fields</p>
            <div className="flex flex-wrap gap-1">
              {fields.map(f => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => onInsert(f.name)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-300 dark:hover:border-violet-500/30 hover:text-violet-700 dark:hover:text-violet-300 transition-colors cursor-pointer"
                  title={`Insert {{${f.name}}}`}
                >
                  <span className="font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {systemVars.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">System Variables</p>
            <div className="flex flex-wrap gap-1">
              {systemVars.map(v => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onInsert(v.name)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/30 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer"
                  title={`Insert {{${v.name}}}`}
                >
                  <span className="font-medium">{v.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {fields.length === 0 && systemVars.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No fields available for this object.</p>
        )}
      </div>
    </div>
  );
}

/* ─── Template Form (inside Modal) ─────────────────────────────── */

function TemplateForm({ template, objectOptions, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    const base = { ...emptyForm(), ...template, object_id: template?.object_id ?? '' };
    // Ensure nullable text fields are never null — null makes React textareas uncontrolled
    base.body_html = base.body_html ?? '';
    base.body_text = base.body_text ?? '';
    base.subject   = base.subject   ?? '';
    base.name      = base.name      ?? '';
    return base;
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Refs for inserting variables at cursor position
  const subjectRef  = useRef(null);
  const bodyHtmlRef = useRef(null);
  const bodyTextRef = useRef(null);
  const [activeField, setActiveField] = useState('body_html');

  const insertVariable = useCallback((fieldName) => {
    const tag = `{{${fieldName}}}`;
    const refMap = { subject: subjectRef, body_html: bodyHtmlRef, body_text: bodyTextRef };
    const inputRef = refMap[activeField];
    const el = inputRef?.current;

    if (el) {
      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? start;
      const val   = el.value;
      const newVal = val.substring(0, start) + tag + val.substring(end);
      set(activeField, newVal);
      // Restore cursor position after the inserted tag
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + tag.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      // Fallback: append to the active field
      set(activeField, (form[activeField] || '') + tag);
    }
  }, [activeField, form]);

  const handleSave = () => {
    if (!form.name.trim() || !form.subject.trim() || !form.object_id) return;
    onSave({ ...form, object_id: Number(form.object_id) });
  };

  return (
    <div className="space-y-5">
      {/* Object selector — which Module > Object this template belongs to */}
      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign to Object *</label>
        <select
          className="form-input w-full text-sm mt-1"
          value={form.object_id}
          onChange={e => set('object_id', e.target.value)}
        >
          <option value="">Select Module &gt; Object…</option>
          {objectOptions.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.moduleLabel} &gt; {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Variable picker — click to insert field into template */}
      <VariablePicker objectId={form.object_id} onInsert={insertVariable} />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Template Name" required
          placeholder="Lead Follow-up"
          value={form.name}
          onChange={e => set('name', e.target.value)}
        />
        <Select
          label="Category"
          options={CATEGORIES}
          value={form.category}
          onChange={e => set('category', e.target.value)}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Subject Line *</label>
        <input
          ref={subjectRef}
          className="form-input w-full text-sm mt-1"
          placeholder="Thank you for your interest, {{first_name}}"
          value={form.subject}
          onChange={e => set('subject', e.target.value)}
          onFocus={() => setActiveField('subject')}
        />
        <p className="form-help">Click a field above to insert it, or type {'{{field_name}}'} manually</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Language"
          options={LANGUAGES}
          value={form.language}
          onChange={e => set('language', e.target.value)}
        />
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="form-checkbox"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Body (HTML)</label>
        <textarea
          ref={bodyHtmlRef}
          className="form-input font-mono text-xs resize-none mt-1 w-full"
          rows={10}
          value={form.body_html}
          onChange={e => set('body_html', e.target.value)}
          onFocus={() => setActiveField('body_html')}
          placeholder={'<h2>Hello {{first_name}},</h2>\n<p>Thank you for your interest...</p>'}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Body (Plain Text)</label>
        <textarea
          ref={bodyTextRef}
          className="form-input text-sm resize-none mt-1 w-full"
          rows={5}
          value={form.body_text}
          onChange={e => set('body_text', e.target.value)}
          onFocus={() => setActiveField('body_text')}
          placeholder="Hello {{first_name}},\nThank you for your interest..."
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          onClick={handleSave}
          loading={saving}
          disabled={!form.name.trim() || !form.subject.trim() || !form.object_id}
        >
          {template?.id ? 'Update Template' : 'Create Template'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */

/** System-level variable labels (not tied to any object). */
const SYSTEM_VAR_LABELS = {
  sender_name:     'Sender Name',
  sender_email:    'Sender Email',
  company_name:    'Company Name',
  help_center_url: 'Help Center URL',
};

/** Convert a snake_case variable name to a readable label as fallback. */
function prettifyVarName(name) {
  return SYSTEM_VAR_LABELS[name]
    || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── Preview Panel ────────────────────────────────────────────── */

function PreviewPanel({ templateId, fieldLabelMap, onClose }) {
  const [previewVars, setPreviewVars] = useState({});

  const { data: template, isLoading } = useQuery({
    queryKey: ['email-template-detail', templateId],
    queryFn:  () => emailService.getTemplate(templateId).then(r => r.data ?? r),
    enabled:  !!templateId,
  });

  const vars = Array.isArray(template?.variables) ? template.variables : [];

  const previewMutation = useMutation({
    mutationFn: () => emailService.renderTemplate(templateId, previewVars)
      .then(r => r.data ?? r),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!template) return <p className="text-sm text-gray-500 py-4">Template not found.</p>;

  return (
    <div className="space-y-4">
      {vars.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Preview Variables</p>
          <div className="grid grid-cols-2 gap-2">
            {vars.map(v => (
              <Input
                key={v}
                label={fieldLabelMap[v] || prettifyVarName(v)}
                placeholder={prettifyVarName(v)}
                value={previewVars[v] || ''}
                onChange={e => setPreviewVars(p => ({ ...p, [v]: e.target.value }))}
              />
            ))}
          </div>
          <Button
            variant="outline" size="sm" className="mt-2"
            onClick={() => previewMutation.mutate()}
            loading={previewMutation.isPending}
          >
            <Eye className="w-3.5 h-3.5" /> Render Preview
          </Button>
        </div>
      )}

      {previewMutation.data && (
        <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="bg-gray-50 dark:bg-white/5 px-4 py-2 border-b border-gray-200 dark:border-white/10">
            <p className="text-xs font-semibold text-gray-500">Subject: {previewMutation.data.subject}</p>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            {previewMutation.data.body_html ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewMutation.data.body_html }} />
            ) : (
              <pre className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{previewMutation.data.body_text}</pre>
            )}
          </div>
        </div>
      )}

      {!previewMutation.data && template.body_html && (
        <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
          <div className="bg-gray-50 dark:bg-white/5 px-4 py-2 border-b border-gray-200 dark:border-white/10">
            <p className="text-xs font-semibold text-gray-500">Subject: {template.subject}</p>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto">
            <div className="text-sm text-gray-700 dark:text-gray-300 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: template.body_html }} />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

/* ─── Template Row ─────────────────────────────────────────────── */

function TemplateRow({ tpl, fieldLabelMap, isExpanded, onToggle, onEdit, onPreview, onDelete }) {
  const vars = Array.isArray(tpl.variables) ? tpl.variables : [];
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <Mail className="w-4 h-4 text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{tpl.name}</p>
            {tpl.category && <Badge color={CATEGORY_COLORS[tpl.category] || 'default'} size="sm">{tpl.category}</Badge>}
            {!tpl.is_active && <Badge color="danger" size="sm">Inactive</Badge>}
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">{tpl.subject}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400">{tpl.usage_count ?? 0} uses</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-5 pb-4 pt-1 border-t border-gray-100 dark:border-white/[0.05] space-y-3">
          {vars.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Variables</p>
              <div className="flex flex-wrap gap-1.5">
                {vars.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-violet-50 text-violet-600" title={`{{${v}}}`}>
                    {fieldLabelMap[v] || prettifyVarName(v)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Subject</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-1.5">{tpl.subject}</p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="xs" onClick={onEdit}>Edit</Button>
            <Button variant="outline" size="xs" onClick={onPreview}>
              <Eye className="w-3 h-3" /> Preview
            </Button>
            <Button
              variant="ghost" size="xs"
              className="text-red-500 hover:text-red-600 ml-auto"
              onClick={async () => { if (await confirmDialog({ title: 'Delete template', message: 'This email template will be permanently removed.', confirmLabel: 'Delete' })) onDelete(); }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export default function EmailTemplateBuilderPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen]       = useState(false);
  const [previewOpen, setPreviewOpen]   = useState(false);
  const [editing, setEditing]           = useState(null);
  const [previewing, setPreviewing]     = useState(null);
  const [expanded, setExpanded]         = useState(null);

  // ── Fetch all modules with objects ──────────────────────────────
  const { data: modulesData } = useQuery({
    queryKey: ['runtime-modules'],
    queryFn:  runtimeService.getModules,
  });

  // Flat list of { id, name, label, moduleId, moduleLabel } for the object selector
  const objectOptions = useMemo(() => {
    const mods = modulesData?.data ?? [];
    const opts = [];
    for (const mod of mods) {
      for (const obj of (mod.objects ?? [])) {
        // Skip the email_template object itself
        if (obj.name === 'email_template') continue;
        opts.push({
          id: obj.id,
          name: obj.name,
          label: obj.label,
          moduleId: mod.id,
          moduleLabel: mod.label,
        });
      }
    }
    return opts;
  }, [modulesData]);

  // ── Fetch all templates ─────────────────────────────────────────
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['builder-email-templates'],
    queryFn:  () => emailService.getTemplates({ is_active: undefined, limit: 500 })
      .then(r => r.data?.templates ?? r.data ?? []),
  });

  // ── Fetch field labels for all objects that have templates ──────
  const objectIdsWithTemplates = useMemo(() => {
    const ids = new Set();
    for (const tpl of templatesData ?? []) {
      if (tpl.object_id) ids.add(tpl.object_id);
    }
    return Array.from(ids);
  }, [templatesData]);

  const { data: fieldLabelsData } = useQuery({
    queryKey: ['template-field-labels', objectIdsWithTemplates],
    queryFn:  async () => {
      const results = await Promise.all(
        objectIdsWithTemplates.map(id =>
          emailService.getTemplateFields(id).then(r => ({ objectId: id, ...(r.data ?? r) }))
        )
      );
      // Build a flat map: variableName → label (across all objects)
      const map = { ...SYSTEM_VAR_LABELS };
      for (const res of results) {
        for (const f of (res.fields ?? [])) {
          if (!map[f.name]) map[f.name] = f.label;
        }
        for (const sv of (res.system_variables ?? [])) {
          if (!map[sv.name]) map[sv.name] = sv.label;
        }
      }
      return map;
    },
    enabled: objectIdsWithTemplates.length > 0,
  });
  const fieldLabelMap = fieldLabelsData ?? SYSTEM_VAR_LABELS;

  // Group templates by Module > Object
  const groupedTemplates = useMemo(() => {
    const allTpls = templatesData ?? [];
    const mods    = modulesData?.data ?? [];
    const groups = []; // [{ module, object, templates[] }]
    const byObjectId = new Map();
    const unassigned = [];

    for (const tpl of allTpls) {
      if (tpl.object_id && tpl.object) {
        if (!byObjectId.has(tpl.object_id)) byObjectId.set(tpl.object_id, []);
        byObjectId.get(tpl.object_id).push(tpl);
      } else {
        unassigned.push(tpl);
      }
    }

    // Build sorted groups from modules
    for (const mod of mods) {
      for (const obj of (mod.objects ?? [])) {
        if (obj.name === 'email_template') continue;
        const tpls = byObjectId.get(obj.id);
        if (tpls?.length) {
          groups.push({
            moduleLabel: mod.label,
            objectId: obj.id,
            objectLabel: obj.label,
            objectName: obj.name,
            templates: tpls,
          });
        }
      }
    }

    // Add unassigned at the end
    if (unassigned.length) {
      groups.push({
        moduleLabel: 'Unassigned',
        objectId: null,
        objectLabel: 'No Object',
        objectName: null,
        templates: unassigned,
      });
    }

    return groups;
  }, [templatesData, modulesData]);

  // ── Mutations ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => emailService.createTemplate(data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['builder-email-templates'] }); setModalOpen(false); setEditing(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => emailService.updateTemplate(id, data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['builder-email-templates'] }); setModalOpen(false); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => emailService.deleteTemplate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['builder-email-templates'] }),
  });

  const handleSave = (formData) => {
    if (editing?.id) {
      updateMut.mutate({ id: editing.id, data: formData });
    } else {
      createMut.mutate(formData);
    }
  };

  const handleEdit = (tpl) => {
    setEditing(tpl);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        icon={Mail}
        eyebrow="Builder"
        title="Email Templates"
        subtitle="Manage email templates organized by Module › Object."
        actions={(
          <Button size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4" /> New Template
          </Button>
        )}
      />

      <BuilderGuide section="/builder/email-templates" />

      {/* Template groups */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : groupedTemplates.length === 0 ? (
        <div className="card p-12 text-center">
          <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No email templates yet.</p>
          <Button size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4" /> Create First Template
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTemplates.map(group => (
            <div key={group.objectId ?? 'unassigned'}>
              {/* Section header: Module > Object */}
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                  {group.moduleLabel}
                  <span className="text-gray-400 mx-1">&gt;</span>
                  {group.objectLabel}
                </h2>
                <Badge color="default" size="sm">{group.templates.length}</Badge>
              </div>

              <div className="space-y-2">
                {group.templates.map(tpl => (
                  <TemplateRow
                    key={tpl.id}
                    tpl={tpl}
                    fieldLabelMap={fieldLabelMap}
                    isExpanded={expanded === tpl.id}
                    onToggle={() => setExpanded(expanded === tpl.id ? null : tpl.id)}
                    onEdit={() => handleEdit(tpl)}
                    onPreview={() => { setPreviewing(tpl); setPreviewOpen(true); }}
                    onDelete={() => deleteMut.mutate(tpl.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing?.id ? 'Edit Email Template' : 'New Email Template'}
        size="lg"
      >
        <TemplateForm
          template={editing}
          objectOptions={objectOptions}
          onSave={handleSave}
          onCancel={() => { setModalOpen(false); setEditing(null); }}
          saving={createMut.isPending || updateMut.isPending}
        />
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewing(null); }}
        title={`Preview: ${previewing?.name ?? ''}`}
        size="lg"
      >
        {previewing && (
          <PreviewPanel templateId={previewing.id} fieldLabelMap={fieldLabelMap} onClose={() => { setPreviewOpen(false); setPreviewing(null); }} />
        )}
      </Modal>
    </div>
  );
}
