import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, Plus, Trash2, Pencil, ShieldCheck, Clock, HardDrive,
  ListChecks, AlertCircle, FileCode, Eye,
} from 'lucide-react';
import { builderService } from '../../services/builder.service';
import { settingsService } from '../../services/settings.service';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { confirmDialog } from '../../utils/dialog';

/* ── Category modal ───────────────────────────────────────── */

const BLANK_CATEGORY = {
  code: '', label: '', description: '', color: '#6366f1',
  allowed_mime: '', max_file_mb: '', retention_days: '',
  review_required: false, is_required: false, is_active: true, order_index: 0,
};

function CategoryModal({ open, onClose, initial, onSave, saving }) {
  const [form, setForm] = useState(initial ?? BLANK_CATEGORY);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      allowed_mime: form.allowed_mime
        ? String(form.allowed_mime).split(',').map(s => s.trim()).filter(Boolean)
        : null,
      max_file_mb: form.max_file_mb === '' ? null : Number(form.max_file_mb),
      retention_days: form.retention_days === '' ? null : Number(form.retention_days),
      order_index: Number(form.order_index) || 0,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit Category' : 'New Category'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Label" required placeholder="Proof of Income" value={form.label} onChange={e => set('label', e.target.value)} />
          <Input label="Code" required placeholder="proof_of_income" value={form.code} onChange={e => set('code', e.target.value)}
            disabled={!!initial?.id} hint={initial?.id ? 'Code is immutable once created' : 'Lowercase machine key'} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea className="input w-full h-16 resize-none" value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Max size (MB)" type="number" placeholder="global" value={form.max_file_mb} onChange={e => set('max_file_mb', e.target.value)} />
          <Input label="Retention (days)" type="number" placeholder="global" value={form.retention_days} onChange={e => set('retention_days', e.target.value)} />
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
            <input type="color" className="h-9 w-full rounded-lg border border-gray-200 dark:border-white/10 bg-transparent" value={form.color} onChange={e => set('color', e.target.value)} />
          </div>
        </div>

        <Input label="Allowed MIME types" placeholder="application/pdf, image/png  (blank = inherit global)"
          value={form.allowed_mime} onChange={e => set('allowed_mime', e.target.value)}
          hint="Comma-separated. Leave blank to inherit the global allow-list." />

        <div className="flex flex-wrap gap-5 pt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.review_required} onChange={e => set('review_required', e.target.checked)} />
            Requires review (upload → under review)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.is_required} onChange={e => set('is_required', e.target.checked)} />
            Required document
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            Active
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save Category'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Checklist modal ──────────────────────────────────────── */

function ChecklistModal({ open, onClose, initial, categories, onSave, saving }) {
  const [form, setForm] = useState(initial ?? { entity_type: '', label: '', description: '', items: [], is_active: true, order_index: 0 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleItem = (code) => {
    setForm(f => {
      const exists = f.items.find(i => i.category_code === code);
      return {
        ...f,
        items: exists
          ? f.items.filter(i => i.category_code !== code)
          : [...f.items, { category_code: code, required: true }],
      };
    });
  };
  const setRequired = (code, required) =>
    setForm(f => ({ ...f, items: f.items.map(i => i.category_code === code ? { ...i, required } : i) }));

  const submit = (e) => { e.preventDefault(); onSave({ ...form, order_index: Number(form.order_index) || 0 }); };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit Checklist' : 'New Checklist'} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Label" required placeholder="New Application Documents" value={form.label} onChange={e => set('label', e.target.value)} />
          <Input label="Entity type" required placeholder="application" value={form.entity_type} onChange={e => set('entity_type', e.target.value)}
            disabled={!!initial?.id} hint="lead | contact | account | case…" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Required documents</label>
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400 flex items-center gap-1.5"><AlertCircle className="h-4 w-4" /> Create categories first.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg border border-gray-100 dark:border-white/[0.07] p-2">
              {categories.map(cat => {
                const item = form.items.find(i => i.category_code === cat.code);
                return (
                  <div key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                    <input type="checkbox" checked={!!item} onChange={() => toggleItem(cat.code)} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{cat.label}</span>
                    {item && (
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        <input type="checkbox" checked={item.required} onChange={e => setRequired(cat.code, e.target.checked)} />
                        mandatory
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active
        </label>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save Checklist'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Template modal ───────────────────────────────────────── */

const BLANK_TEMPLATE = { name: '', description: '', entity_type: '', format: 'html', output_category: '', body: '', is_active: true };

function TemplateModal({ open, onClose, initial, onSave, saving }) {
  const [form, setForm] = useState(initial ?? BLANK_TEMPLATE);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const placeholders = useMemo(() => {
    const found = new Set();
    const re = /\{\{\s*([\w.]+)\s*\}\}/g;
    let m;
    while ((m = re.exec(form.body || ''))) found.add(m[1]);
    return [...found];
  }, [form.body]);

  const runPreview = async () => {
    if (!initial?.id) { setPreview('Save the template first to preview with live rendering.'); return; }
    setPreviewing(true);
    try {
      // Sample context: echo each placeholder path as a readable token.
      const data = {};
      placeholders.forEach(p => {
        const segs = p.split('.');
        let node = data;
        segs.forEach((s, i) => { if (i === segs.length - 1) node[s] = `[${p}]`; else node = (node[s] ||= {}); });
      });
      const res = await builderService.previewDocumentTemplate(initial.id, data);
      setPreview(res?.data?.content ?? '');
    } catch { setPreview('Preview failed.'); }
    finally { setPreviewing(false); }
  };

  const submit = (e) => { e.preventDefault(); onSave(form); };

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit Template' : 'New Template'} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required placeholder="Welcome Letter" value={form.name} onChange={e => set('name', e.target.value)} />
          <Input label="Target entity" placeholder="contact | lead | application…" value={form.entity_type ?? ''} onChange={e => set('entity_type', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Format</label>
            <select className="input w-full" value={form.format} onChange={e => set('format', e.target.value)}>
              <option value="html">HTML</option>
              <option value="text">Plain text</option>
            </select>
          </div>
          <Input label="Output category" placeholder="generated" value={form.output_category ?? ''} onChange={e => set('output_category', e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pt-6">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} /> Active
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Body *</label>
            <span className="text-[11px] text-gray-400">Use {'{{field}}'} or {'{{contact.first_name}}'}</span>
          </div>
          <textarea className="input w-full h-48 font-mono text-xs resize-y" placeholder="<p>Dear {{contact.first_name}},</p>" value={form.body} onChange={e => set('body', e.target.value)} required />
        </div>

        {placeholders.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-gray-400">Placeholders:</span>
            {placeholders.map(p => <Badge key={p} variant="default">{p}</Badge>)}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={runPreview} disabled={previewing}>
            <Eye className="h-3.5 w-3.5 mr-1" />{previewing ? 'Rendering…' : 'Preview'}
          </Button>
        </div>
        {preview != null && (
          <div className="rounded-lg border border-gray-100 dark:border-white/[0.07] p-3 bg-gray-50 dark:bg-white/5 max-h-48 overflow-auto">
            <pre className="text-[11px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">{preview}</pre>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function DocumentBuilderPage() {
  const qc = useQueryClient();
  const [catModal, setCatModal] = useState(null);   // null | {} | category
  const [chkModal, setChkModal] = useState(null);
  const [tplModal, setTplModal] = useState(null);

  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['doc-categories', 'all'],
    queryFn: () => builderService.getDocumentCategories(true),
  });
  const { data: chkData, isLoading: chkLoading } = useQuery({
    queryKey: ['doc-checklists'],
    queryFn: () => builderService.getDocumentChecklists(),
  });
  const { data: tplData, isLoading: tplLoading } = useQuery({
    queryKey: ['doc-templates'],
    queryFn: () => builderService.getDocumentTemplates(true),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['doc-settings'],
    queryFn: () => settingsService.get(),
  });

  const categories = catData?.data ?? [];
  const checklists = chkData?.data ?? [];
  const templates = tplData?.data ?? [];

  // Global display settings (stored in the shared "documents" settings group).
  const settingValues = settingsData?.data?.values ?? {};
  const previewButtonEnabled = settingValues['documents.show_preview_button'] !== false;
  const savePreviewSetting = useMutation({
    mutationFn: (value) => settingsService.update({ 'documents.show_preview_button': value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doc-settings'] }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['doc-categories'] });
    qc.invalidateQueries({ queryKey: ['doc-checklists'] });
    qc.invalidateQueries({ queryKey: ['doc-templates'] });
  };

  const saveCat = useMutation({
    mutationFn: (d) => d.id ? builderService.updateDocumentCategory(d.id, d) : builderService.createDocumentCategory(d),
    onSuccess: () => { invalidate(); setCatModal(null); },
  });
  const delCat = useMutation({
    mutationFn: (id) => builderService.deleteDocumentCategory(id),
    onSuccess: invalidate,
  });
  const saveChk = useMutation({
    mutationFn: (d) => d.id ? builderService.updateDocumentChecklist(d.id, d) : builderService.createDocumentChecklist(d),
    onSuccess: () => { invalidate(); setChkModal(null); },
  });
  const delChk = useMutation({
    mutationFn: (id) => builderService.deleteDocumentChecklist(id),
    onSuccess: invalidate,
  });
  const saveTpl = useMutation({
    mutationFn: (d) => d.id ? builderService.updateDocumentTemplate(d.id, d) : builderService.createDocumentTemplate(d),
    onSuccess: () => { invalidate(); setTplModal(null); },
  });
  const delTpl = useMutation({
    mutationFn: (id) => builderService.deleteDocumentTemplate(id),
    onSuccess: invalidate,
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <PageHeader
        icon={FolderOpen}
        eyebrow="Builder"
        title="Document Management"
        subtitle="Configure the categories, upload rules, review policy, and required-document checklists that power the Documents module."
      />

      <BuilderGuide section="/builder/documents" />

      {/* Display & Preview */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <Eye className="h-4 w-4 text-sky-500" /> Display &amp; Preview
          </h2>
        </div>
        <div className="card px-4 py-3.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={previewButtonEnabled}
              disabled={savePreviewSetting.isPending}
              onChange={(e) => savePreviewSetting.mutate(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Show the “Preview” button</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Let users preview documents in-app — PDFs and images render natively, Word and Excel files are
                converted for viewing — before downloading. Applies everywhere a Download action appears,
                including public share links. Turn off to hide the Preview button everywhere.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-amber-500" /> Categories
          </h2>
          <Button variant="primary" size="sm" onClick={() => setCatModal({})}><Plus className="h-4 w-4" /> New Category</Button>
        </div>

        {catLoading ? <Spinner /> : categories.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-gray-400">No categories yet. Create your first document category.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {categories.map(cat => (
              <div key={cat.id} className="card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cat.color}22`, color: cat.color }}>
                      <FolderOpen className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{cat.label}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{cat.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="xs" onClick={() => setCatModal(cat)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="xs" className="text-red-600 hover:bg-red-50" title="Delete"
                      onClick={async () => (await confirmDialog({ title: 'Delete category', message: `“${cat.label}” will be removed from the document taxonomy.`, confirmLabel: 'Delete' })) && delCat.mutate(cat.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {!cat.is_active && <Badge variant="default">Inactive</Badge>}
                  {cat.review_required && <Badge variant="warning"><ShieldCheck className="h-3 w-3 mr-1" />Review</Badge>}
                  {cat.is_required && <Badge variant="info">Required</Badge>}
                  {cat.max_file_mb != null && <Badge variant="default"><HardDrive className="h-3 w-3 mr-1" />{cat.max_file_mb}MB</Badge>}
                  {cat.retention_days != null && <Badge variant="default"><Clock className="h-3 w-3 mr-1" />{cat.retention_days}d</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Checklists */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary-500" /> Required-Document Checklists
          </h2>
          <Button variant="primary" size="sm" onClick={() => setChkModal({})} disabled={categories.length === 0}>
            <Plus className="h-4 w-4" /> New Checklist
          </Button>
        </div>

        {chkLoading ? <Spinner /> : checklists.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-gray-400">No checklists configured. Define which documents are required per entity type.</p>
        ) : (
          <div className="space-y-3">
            {checklists.map(chk => (
              <div key={chk.id} className="card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{chk.label}</p>
                    <p className="text-[11px] text-gray-400">Entity: <span className="font-mono">{chk.entity_type}</span></p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="xs" onClick={() => setChkModal({ ...chk, items: chk.items ?? [] })} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="xs" className="text-red-600 hover:bg-red-50" title="Delete"
                      onClick={async () => (await confirmDialog({ title: 'Delete checklist', message: `“${chk.label}” will no longer be offered when collecting documents.`, confirmLabel: 'Delete' })) && delChk.mutate(chk.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {(chk.items ?? []).map(it => {
                    const cat = categories.find(c => c.code === it.category_code);
                    return (
                      <Badge key={it.category_code} variant={it.required ? 'info' : 'default'}>
                        {cat?.label ?? it.category_code}{it.required ? ' *' : ''}
                      </Badge>
                    );
                  })}
                  {(chk.items ?? []).length === 0 && <span className="text-xs text-gray-400">No documents selected</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Templates */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <FileCode className="h-4 w-4 text-emerald-500" /> Merge Templates
          </h2>
          <Button variant="primary" size="sm" onClick={() => setTplModal({})}><Plus className="h-4 w-4" /> New Template</Button>
        </div>

        {tplLoading ? <Spinner /> : templates.length === 0 ? (
          <p className="card px-6 py-8 text-center text-sm text-gray-400">No templates yet. Create reusable documents with {'{{placeholders}}'} that merge record data at generation time.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {templates.map(tpl => (
              <div key={tpl.id} className="card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                      <FileCode className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{tpl.name}</p>
                      <p className="text-[11px] text-gray-400">{tpl.format?.toUpperCase()}{tpl.entity_type ? ` · ${tpl.entity_type}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="xs" onClick={() => setTplModal(tpl)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="xs" className="text-red-600 hover:bg-red-50" title="Delete"
                      onClick={async () => (await confirmDialog({ title: 'Delete template', message: `“${tpl.name}” will be permanently removed.`, confirmLabel: 'Delete' })) && delTpl.mutate(tpl.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {!tpl.is_active && <Badge variant="default">Inactive</Badge>}
                  {tpl.output_category && <Badge variant="info">→ {tpl.output_category}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {catModal && (
        <CategoryModal
          open
          onClose={() => setCatModal(null)}
          initial={catModal.id ? {
            ...catModal,
            allowed_mime: Array.isArray(catModal.allowed_mime) ? catModal.allowed_mime.join(', ') : '',
            max_file_mb: catModal.max_file_mb ?? '',
            retention_days: catModal.retention_days ?? '',
          } : null}
          onSave={(d) => saveCat.mutate(catModal.id ? { ...d, id: catModal.id } : d)}
          saving={saveCat.isPending}
        />
      )}
      {chkModal && (
        <ChecklistModal
          open
          onClose={() => setChkModal(null)}
          initial={chkModal.id ? chkModal : null}
          categories={categories.filter(c => c.is_active)}
          onSave={(d) => saveChk.mutate(chkModal.id ? { ...d, id: chkModal.id } : d)}
          saving={saveChk.isPending}
        />
      )}
      {tplModal && (
        <TemplateModal
          open
          onClose={() => setTplModal(null)}
          initial={tplModal.id ? tplModal : null}
          onSave={(d) => saveTpl.mutate(tplModal.id ? { ...d, id: tplModal.id } : d)}
          saving={saveTpl.isPending}
        />
      )}
    </div>
  );
}
