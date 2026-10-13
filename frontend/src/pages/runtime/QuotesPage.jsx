import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, FileText, DollarSign, Calendar,
  CheckCircle, XCircle, Send, Clock, AlertTriangle, MessageSquare,
  Package, ChevronLeft, ShoppingCart, ChevronDown, ChevronUp,
  Building2, User, Percent,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import { runtimeService } from '../../services/metadata.service';
import { useCurrencyStore } from '../../store/currencyStore';

/* ── Status helpers ───────────────────────────────────────── */

const STATUS_META = {
  draft:    { variant: 'default', label: 'Draft',    icon: Clock },
  sent:     { variant: 'info',    label: 'Sent',     icon: Send },
  accepted: { variant: 'success', label: 'Accepted', icon: CheckCircle },
  rejected: { variant: 'danger',  label: 'Rejected', icon: XCircle },
  expired:  { variant: 'warning', label: 'Expired',  icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

/* ── Address Section (collapsible) ────────────────────────── */

function AddressSection({ title, prefix, form, set }) {
  const [open, setOpen] = useState(false);
  const fields = ['street', 'city', 'state', 'country', 'zip'];
  const hasValues = fields.some(f => form[`${prefix}_${f}`]);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5" onClick={() => setOpen(o => !o)}>
        <span>{title}{hasValues && <span className="ml-1 text-xs text-emerald-500">(filled)</span>}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 dark:border-white/[0.07] px-3 py-3">
          <Input label="Street" value={form[`${prefix}_street`]} onChange={e => set(`${prefix}_street`, e.target.value)} placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City" value={form[`${prefix}_city`]} onChange={e => set(`${prefix}_city`, e.target.value)} placeholder="San Francisco" />
            <Input label="State" value={form[`${prefix}_state`]} onChange={e => set(`${prefix}_state`, e.target.value)} placeholder="CA" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Country" value={form[`${prefix}_country`]} onChange={e => set(`${prefix}_country`, e.target.value)} placeholder="US" />
            <Input label="ZIP" value={form[`${prefix}_zip`]} onChange={e => set(`${prefix}_zip`, e.target.value)} placeholder="94105" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Quote Form ───────────────────────────────────────────── */

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'INR', label: 'INR — Indian Rupee' },
];

function QuoteForm({ form, setForm, onSubmit, onCancel, saving, opportunities, accounts, contacts }) {
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const oppOptions = (opportunities || []).map(o => ({ value: String(o.id), label: o.name }));
  const accountOptions = [{ value: '', label: 'None' }, ...(accounts || []).map(a => ({ value: String(a.id), label: a.name || `Account #${a.id}` }))];
  const contactOptions = [{ value: '', label: 'None' }, ...(contacts || []).map(c => ({ value: String(c.id), label: `${c.first_name || ''} ${c.last_name || ''}`.trim() || `Contact #${c.id}` }))];

  return (
    <div className="space-y-4">
      <Input
        label="Quote Name"
        required
        placeholder="Q4 Enterprise License Renewal"
        value={form.name}
        onChange={e => set('name', e.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Linked Opportunity"
          placeholder="Select opportunity"
          options={[{ value: '', label: 'None' }, ...oppOptions]}
          value={form.opportunity_id}
          onChange={e => set('opportunity_id', e.target.value)}
        />
        <Input label="Valid Until" type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Select label="Account" options={accountOptions} value={form.account_id} onChange={e => set('account_id', e.target.value)} />
        <Select label="Contact" options={contactOptions} value={form.contact_id} onChange={e => set('contact_id', e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input label="Discount (%)" type="number" min="0" max="100" step="0.5" value={form.discount_percent} onChange={e => set('discount_percent', e.target.value)} placeholder="0" />
        <Input label="Discount (Fixed $)" type="number" min="0" step="0.01" value={form.discount_amount} onChange={e => set('discount_amount', e.target.value)} placeholder="0.00" />
        <Select label="Currency" options={CURRENCY_OPTIONS} value={form.currency} onChange={e => set('currency', e.target.value)} />
      </div>
      <AddressSection title="Billing Address" prefix="billing" form={form} set={set} />
      <AddressSection title="Shipping Address" prefix="shipping" form={form} set={set} />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Terms</label>
        <textarea className="form-input resize-none" rows={3} placeholder="Payment terms, delivery conditions…" value={form.terms} onChange={e => set('terms', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
        <textarea className="form-input resize-none" rows={2} placeholder="Internal notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={onSubmit} loading={saving}>
          {form._isEdit ? 'Save Changes' : 'Create Quote'}
        </Button>
      </div>
    </div>
  );
}

/* ── Line Item Form (inline add/edit) ────────────────────── */

const emptyLineItem = () => ({ product_id: '', name: '', description: '', quantity: '1', unit_price: '', discount: '0' });

function LineItemForm({ item, setItem, products, onSave, onCancel, saving }) {
  const set = (k, v) => setItem(p => ({ ...p, [k]: v }));
  const productOpts = [
    { value: '', label: 'Custom item (no product)' },
    ...(products || []).map(p => ({ value: String(p.id), label: `${p.name}${p.sku ? ` (${p.sku})` : ''} — $${Number(p.unit_price).toFixed(2)}` })),
  ];

  const onProductChange = (e) => {
    const pid = e.target.value;
    set('product_id', pid);
    if (pid) {
      const p = (products || []).find(x => String(x.id) === pid);
      if (p) {
        set('name', p.name);
        set('unit_price', String(p.unit_price));
        if (p.description) set('description', p.description);
      }
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/[0.03] p-4">
      <Select label="Product" options={productOpts} value={item.product_id} onChange={onProductChange} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Name" required value={item.name} onChange={e => set('name', e.target.value)} placeholder="Line item name" />
        <Input label="Description" value={item.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input label="Quantity" type="number" min="1" step="1" required value={item.quantity} onChange={e => set('quantity', e.target.value)} />
        <Input label="Unit Price ($)" type="number" min="0" step="0.01" required value={item.unit_price} onChange={e => set('unit_price', e.target.value)} prefix={<DollarSign className="h-3.5 w-3.5" />} />
        <Input label="Discount (%)" type="number" min="0" max="100" step="0.5" value={item.discount} onChange={e => set('discount', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={saving} disabled={!item.name || !item.unit_price}>
          {item._isEdit ? 'Update' : 'Add Item'}
        </Button>
      </div>
    </div>
  );
}

/* ── Quote Detail View ───────────────────────────────────── */

function QuoteDetail({ quoteId, onBack, products }) {
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['quote', quoteId] }); qc.invalidateQueries({ queryKey: ['quotes'] }); };

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => runtimeService.getQuote(quoteId).then(r => r.data),
    enabled: !!quoteId,
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [editItem, setEditItem]       = useState(null);
  const [lineForm, setLineForm]       = useState(emptyLineItem());

  const addMut = useMutation({
    mutationFn: data => runtimeService.addLineItem(quoteId, data),
    onSuccess: () => { invalidate(); setShowAddForm(false); setLineForm(emptyLineItem()); },
  });
  const updateMut = useMutation({
    mutationFn: ({ itemId, data }) => runtimeService.updateLineItem(quoteId, itemId, data),
    onSuccess: () => { invalidate(); setEditItem(null); setLineForm(emptyLineItem()); },
  });
  const deleteMut = useMutation({
    mutationFn: itemId => runtimeService.deleteLineItem(quoteId, itemId),
    onSuccess: invalidate,
  });

  const handleAddSave = () => {
    const { product_id, name, description, quantity, unit_price, discount } = lineForm;
    addMut.mutate({
      product_id: product_id ? parseInt(product_id) : null,
      name,
      description: description || null,
      quantity: parseFloat(quantity) || 1,
      unit_price: parseFloat(unit_price) || 0,
      discount: parseFloat(discount) || 0,
    });
  };

  const handleEditSave = () => {
    const { _itemId, name, description, quantity, unit_price, discount } = lineForm;
    updateMut.mutate({
      itemId: _itemId,
      data: { name, description: description || null, quantity: parseFloat(quantity) || 1, unit_price: parseFloat(unit_price) || 0, discount: parseFloat(discount) || 0 },
    });
  };

  const startEdit = (li) => {
    setEditItem(li.id);
    setLineForm({
      _isEdit: true,
      _itemId: li.id,
      product_id: li.product_id ? String(li.product_id) : '',
      name: li.name || '',
      description: li.description || '',
      quantity: String(li.quantity),
      unit_price: String(li.unit_price),
      discount: String(li.discount ?? 0),
    });
    setShowAddForm(false);
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!quote) return <div className="p-6 text-gray-500 dark:text-gray-400">Quote not found.</div>;

  const lineItems = quote.line_items || [];
  const isDraft = quote.status === 'draft';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Back</Button>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{quote.quote_number}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{quote.name}</p>
          </div>
          <StatusBadge status={quote.status} />
        </div>
      </div>

      {/* Quote details */}
      {(quote.account || quote.contact || quote.currency !== 'USD') && (
        <div className="card px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          {quote.account && (
            <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" /> {quote.account.name || `Account #${quote.account_id}`}</span>
          )}
          {quote.contact && (
            <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" /> {`${quote.contact.first_name || ''} ${quote.contact.last_name || ''}`.trim() || `Contact #${quote.contact_id}`}</span>
          )}
          {quote.currency && quote.currency !== 'USD' && (
            <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" /> {quote.currency}</span>
          )}
          {Number(quote.discount_percent) > 0 && (
            <span className="flex items-center gap-1.5"><Percent className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" /> {quote.discount_percent}% discount</span>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Subtotal</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">${Number(quote.subtotal || 0).toFixed(2)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Discount</p>
          <p className="text-lg font-bold text-red-500">-${Number(quote.discount_amount || 0).toFixed(2)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Tax</p>
          <p className="text-lg font-bold text-gray-600 dark:text-gray-400">${Number(quote.tax_amount || 0).toFixed(2)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">${Number(quote.total_amount || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.07] px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-gray-400 dark:text-gray-500" /> Line Items ({lineItems.length})
          </h3>
          {isDraft && !showAddForm && !editItem && (
            <Button variant="primary" size="sm" onClick={() => { setShowAddForm(true); setLineForm(emptyLineItem()); }}>
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          )}
        </div>

        <div className="divide-y divide-gray-100 dark:divide-white/10">
          {lineItems.map((li) => (
            editItem === li.id ? (
              <div key={li.id} className="p-4">
                <LineItemForm item={lineForm} setItem={setLineForm} products={products} onSave={handleEditSave} onCancel={() => { setEditItem(null); setLineForm(emptyLineItem()); }} saving={updateMut.isPending} />
              </div>
            ) : (
              <div key={li.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-white/5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
                  <Package className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{li.name}</p>
                  {li.description && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{li.description}</p>}
                </div>
                <div className="text-right text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {Number(li.quantity)} &times; ${Number(li.unit_price).toFixed(2)}
                  {Number(li.discount) > 0 && <span className="ml-1 text-xs text-red-500">(-{Number(li.discount)}%)</span>}
                </div>
                <div className="w-24 text-right font-medium text-gray-900 dark:text-gray-100 text-sm">
                  ${Number(li.line_total).toFixed(2)}
                </div>
                {isDraft && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="xs" onClick={() => startEdit(li)} title="Edit"><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="xs" className="text-red-400 hover:text-red-600" onClick={() => deleteMut.mutate(li.id)} title="Remove"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            )
          ))}

          {lineItems.length === 0 && !showAddForm && (
            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No line items yet.{isDraft && ' Click "Add Item" to add products to this quote.'}
            </div>
          )}

          {showAddForm && (
            <div className="p-4">
              <LineItemForm item={lineForm} setItem={setLineForm} products={products} onSave={handleAddSave} onCancel={() => { setShowAddForm(false); setLineForm(emptyLineItem()); }} saving={addMut.isPending} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Reject Modal ─────────────────────────────────────────── */

function RejectModal({ quote, onConfirm, onCancel, pending }) {
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
          <XCircle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reject Quote {quote?.quote_number}</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Provide a reason for the rejection.</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          <MessageSquare className="inline h-3.5 w-3.5 mr-1 text-gray-400 dark:text-gray-500" />
          Rejection Reason
        </label>
        <textarea className="form-input resize-none" rows={3} placeholder="Explain why this quote is being rejected…" value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button variant="danger" onClick={() => onConfirm(reason)} loading={pending} disabled={!reason.trim()}>Reject Quote</Button>
      </div>
    </div>
  );
}

/* ── Confirm Delete Modal ─────────────────────────────────── */

function ConfirmDeleteModal({ quote, onConfirm, onCancel, deleting }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Delete quote <span className="font-semibold">&ldquo;{quote?.quote_number}&rdquo;</span>?
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={deleting}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={deleting}>Delete Quote</Button>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

const emptyForm = () => ({
  name: '', opportunity_id: '', valid_until: '', terms: '', notes: '',
  // New quotes default to the workspace currency, not always USD.
  account_id: '', contact_id: '', discount_percent: '', discount_amount: '',
  currency: useCurrencyStore.getState().code,
  billing_street: '', billing_city: '', billing_state: '', billing_country: '', billing_zip: '',
  shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: '', shipping_zip: '',
});

export default function QuotesPage() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [form, setForm]                 = useState(emptyForm());
  const qc = useQueryClient();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn:  () => runtimeService.getQuotes().then(r => r.data?.quotes ?? r.data ?? []),
  });
  const { data: opportunities } = useQuery({
    queryKey: ['crm-opportunities'],
    queryFn:  () => runtimeService.getRecords('opportunity').then(r => r.data || []),
  });
  const { data: products } = useQuery({
    queryKey: ['products-for-quotes'],
    queryFn:  () => runtimeService.getProducts().then(r => r.data?.products ?? r.data ?? []),
  });
  const { data: accounts } = useQuery({
    queryKey: ['crm-accounts'],
    queryFn:  () => runtimeService.getRecords('account').then(r => r.data || []),
  });
  const { data: contacts } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn:  () => runtimeService.getRecords('contact').then(r => r.data || []),
  });

  const draft    = quotes.filter(q => q.status === 'draft').length;
  const sent     = quotes.filter(q => q.status === 'sent').length;
  const accepted = quotes.filter(q => q.status === 'accepted').length;

  const createMut = useMutation({
    mutationFn: d => runtimeService.createQuote(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => runtimeService.updateQuote(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => runtimeService.deleteQuote(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); setDeleteTarget(null); },
  });
  const statusMut = useMutation({
    mutationFn: ({ id, action, data }) => {
      if (action === 'submit')  return runtimeService.submitQuote(id);
      if (action === 'approve') return runtimeService.approveQuote(id);
      if (action === 'reject')  return runtimeService.rejectQuote(id, data?.rejection_reason);
      throw new Error(`Unknown action: ${action}`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); qc.invalidateQueries({ queryKey: ['quote'] }); setRejectTarget(null); },
  });

  const openCreate = () => { setForm(emptyForm()); setModalOpen(true); };
  const openEdit   = (q) => {
    setForm({
      _isEdit: true, _id: q.id,
      name: q.name || '', opportunity_id: q.opportunity_id?.toString() || '',
      valid_until: q.valid_until ? q.valid_until.split('T')[0] : '',
      terms: q.terms || '', notes: q.notes || '',
      account_id: q.account_id?.toString() || '', contact_id: q.contact_id?.toString() || '',
      discount_percent: q.discount_percent?.toString() || '', discount_amount: q.discount_amount?.toString() || '',
      currency: q.currency || 'USD',
      billing_street: q.billing_street || '', billing_city: q.billing_city || '',
      billing_state: q.billing_state || '', billing_country: q.billing_country || '', billing_zip: q.billing_zip || '',
      shipping_street: q.shipping_street || '', shipping_city: q.shipping_city || '',
      shipping_state: q.shipping_state || '', shipping_country: q.shipping_country || '', shipping_zip: q.shipping_zip || '',
    });
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setForm(emptyForm()); };

  const handleSubmit = () => {
    const { _isEdit, _id, ...fields } = form;
    const payload = {
      ...fields,
      opportunity_id: fields.opportunity_id ? parseInt(fields.opportunity_id) : null,
      account_id: fields.account_id ? parseInt(fields.account_id) : null,
      contact_id: fields.contact_id ? parseInt(fields.contact_id) : null,
      valid_until: fields.valid_until ? new Date(fields.valid_until).toISOString() : null,
      discount_percent: fields.discount_percent ? parseFloat(fields.discount_percent) : 0,
      discount_amount: fields.discount_amount ? parseFloat(fields.discount_amount) : 0,
    };
    if (_isEdit) updateMut.mutate({ id: _id, data: payload });
    else         createMut.mutate(payload);
  };

  const saving = createMut.isPending || updateMut.isPending;

  // ── If a quote is selected, show detail view ──
  if (activeQuoteId) {
    return (
      <div className="min-h-full bg-surface px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <QuoteDetail quoteId={activeQuoteId} onBack={() => setActiveQuoteId(null)} products={products} />
        </div>
      </div>
    );
  }

  // ── Quote list view ──
  const columns = [
    {
      header: 'Quote',
      accessorKey: 'quote_number',
      cell: ({ row: { original: q } }) => (
        <button className="flex items-center gap-3 text-left hover:underline" onClick={() => setActiveQuoteId(q.id)}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20">
            <FileText className="h-4 w-4 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">{q.quote_number}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{q.name}</p>
          </div>
        </button>
      ),
    },
    {
      header: 'Items',
      cell: ({ row: { original: q } }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{q._count?.line_items ?? q.line_items?.length ?? 0}</span>
      ),
    },
    {
      header: 'Total',
      accessorKey: 'total_amount',
      cell: ({ row: { original: q } }) => (
        <span className="font-medium text-gray-800 dark:text-gray-200">
          {q.total_amount != null
            ? <span className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-gray-400 dark:text-gray-500" />{Number(q.total_amount).toFixed(2)}</span>
            : <span className="text-gray-400 dark:text-gray-500">&mdash;</span>}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: ({ row: { original: q } }) => <StatusBadge status={q.status} />,
    },
    {
      header: 'Valid Until',
      accessorKey: 'valid_until',
      cell: ({ row: { original: q } }) => (
        <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
          {q.valid_until ? new Date(q.valid_until).toLocaleDateString() : '\u2014'}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      cell: ({ row: { original: q } }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="xs" onClick={() => openEdit(q)} title="Edit"><Edit className="h-3.5 w-3.5" /></Button>
          {q.status === 'draft' && (
            <Button variant="ghost" size="xs" className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Submit" onClick={() => statusMut.mutate({ id: q.id, action: 'submit' })}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
          {q.status === 'sent' && (
            <>
              <Button variant="ghost" size="xs" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Approve" onClick={() => statusMut.mutate({ id: q.id, action: 'approve' })}>
                <CheckCircle className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="xs" className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Reject" onClick={() => setRejectTarget(q)}>
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="xs" className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete" onClick={() => setDeleteTarget(q)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <PageHeader
          icon={FileText}
          eyebrow="Insurance"
          title="Quotes"
          subtitle="Manage sales quotes through the full approval lifecycle."
          className="!mb-0"
          actions={(
            <Button variant="primary" size="md" onClick={openCreate} className="shrink-0">
              <Plus className="h-4 w-4" /> Create Quote
            </Button>
          )}
        />

        {/* KPI tiles */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total Quotes" value={quotes.length} icon={FileText} tone="primary" />
          <StatTile label="Draft"        value={draft}         icon={Clock}    tone="amber" />
          <StatTile label="Sent"         value={sent}          icon={Send}     tone="sky" />
          <StatTile label="Accepted"     value={accepted}      icon={CheckCircle} tone="emerald" />
        </div>

        {/* Table */}
        <div className="widget">
          {isLoading ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : (
            <DataTable frame={false} data={quotes} columns={columns} emptyText="No quotes yet. Create your first quote to get started." />
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={form._isEdit ? 'Edit Quote' : 'New Quote'} size="lg">
        <QuoteForm form={form} setForm={setForm} onSubmit={handleSubmit} onCancel={closeModal} saving={saving} opportunities={opportunities} accounts={accounts} contacts={contacts} />
      </Modal>
      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Quote" size="sm">
        <RejectModal quote={rejectTarget} onConfirm={reason => statusMut.mutate({ id: rejectTarget.id, action: 'reject', data: { rejection_reason: reason } })} onCancel={() => setRejectTarget(null)} pending={statusMut.isPending} />
      </Modal>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <ConfirmDeleteModal quote={deleteTarget} onConfirm={() => deleteMut.mutate(deleteTarget.id)} onCancel={() => setDeleteTarget(null)} deleting={deleteMut.isPending} />
      </Modal>
    </div>
  );
}
