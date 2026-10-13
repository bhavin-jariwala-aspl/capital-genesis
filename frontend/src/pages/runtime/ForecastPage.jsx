import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Target, Plus, Trash2, RefreshCw, BarChart3, Users } from 'lucide-react';
import { runtimeService } from '../../services/runtime.service';
import { builderService }  from '../../services/builder.service';
import Button  from '../../components/ui/Button';
import Modal   from '../../components/ui/Modal';
import Alert   from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import ObjectPicker, { useAllObjects } from '../../components/ui/ObjectPicker';
import { EmployeePicker, useEmployeeMap } from '../../components/ui/EmployeePicker';
import { fmtCurrency } from '../../utils/formatters';
import { useCurrencyStore } from '../../store/currencyStore';

const PERIOD_TYPES = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual',    label: 'Annual' },
];

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
  { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];

function yearOptions() {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2].map(String);
}

// Money renders in the tenant's currency (BUILDER > Settings > Localization).
const fmt = (n) => fmtCurrency(n);

function SmallChevron() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
function SmallSelect({ value, onChange, children, className = '' }) {
  return (
    <div className="relative">
      <select value={value} onChange={onChange} className={`form-input appearance-none pr-8 ${className}`}>{children}</select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"><SmallChevron /></span>
    </div>
  );
}

function QuotaBar({ quota, employeeName, onDelete }) {
  const target = Number(quota.target_value) || 0;
  return (
    <div className="group relative py-3.5 first:pt-0 last:pb-0 border-b border-gray-50 dark:border-white/[0.07] last:border-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{employeeName || quota.employee_id}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{quota.period_key} · {quota.period_type}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmt(target)}</span>
          <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 dark:text-gray-400 hover:text-red-500 p-1 rounded">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="w-full bg-gray-100 dark:bg-white/[0.06] rounded-full h-1.5">
        <div className="bg-rose-400 h-1.5 rounded-full" style={{ width: '0%' }} />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Target {fmt(target)}</p>
    </div>
  );
}

function ForecastByStage({ byStage }) {
  if (!byStage?.length) {
    return <div className="py-8 text-center"><p className="text-sm text-gray-400 dark:text-gray-500">No stage data available yet.</p></div>;
  }
  const total = byStage.reduce((s, r) => s + (r.amount ?? 0), 0);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-white/[0.07]">
            <th className="pb-3 pr-6 font-medium">Stage</th>
            <th className="pb-3 pr-4 font-medium text-right">Weight</th>
            <th className="pb-3 pr-4 font-medium text-right">Deals</th>
            <th className="pb-3 pr-4 font-medium text-right">Pipeline</th>
            <th className="pb-3 font-medium text-right text-primary-600 dark:text-primary-400">Weighted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-white/10">
          {byStage.map(s => {
            const pct = total > 0 ? Math.round(((s.amount ?? 0) / total) * 100) : 0;
            return (
              <tr key={s.stage ?? 'no_stage'} className="hover:bg-gray-50/40 dark:hover:bg-white/5">
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-primary-400 shrink-0" style={{ opacity: 0.2 + (s.weight ?? 0) * 0.8 }} />
                    <span className="font-medium text-gray-800 dark:text-gray-200">{s.stage ?? 'Unassigned'}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{pct}%</span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                    {s.weight != null ? `${(s.weight * 100).toFixed(0)}%` : '—'}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right text-gray-700 dark:text-gray-300">{s.count}</td>
                <td className="py-3 pr-4 text-right text-gray-700 dark:text-gray-300">{fmt(s.amount)}</td>
                <td className="py-3 text-right font-semibold text-primary-700 dark:text-primary-300">{fmt(s.weighted)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuotaModal({ onClose, objectId }) {
  const qc  = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState({
    employee_id:    '',
    period_type:    'quarterly',
    period_year:    String(now.getFullYear()),
    period_quarter: 'Q' + Math.ceil((now.getMonth() + 1) / 3),
    period_month:   now.toISOString().slice(5, 7),
    target_value:   '',
    // Quotas are entered in the workspace currency rather than always USD.
    currency:       useCurrencyStore.getState().code,
  });
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const periodKey = useMemo(() => {
    if (form.period_type === 'monthly')   return `${form.period_year}-${form.period_month}`;
    if (form.period_type === 'quarterly') return `${form.period_year}-${form.period_quarter}`;
    return form.period_year;
  }, [form.period_type, form.period_year, form.period_quarter, form.period_month]);

  const mut = useMutation({
    mutationFn: (d) => builderService.setQuota({ ...d, object_id: objectId }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['quotas'] }); onClose(); },
    onError:    (e) => setErr(e.response?.data?.message ?? e.message),
  });

  const submit = () => {
    if (!form.employee_id)  return setErr('Please select a sales rep.');
    if (!form.target_value) return setErr('Target value is required.');
    setErr(null);
    mut.mutate({ employee_id: form.employee_id, period_type: form.period_type, period_key: periodKey, target_value: Number(form.target_value), currency: form.currency });
  };

  return (
    <Modal isOpen onClose={onClose} title="Set Sales Quota" size="md"
      footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={mut.isPending} onClick={submit}>Save Quota</Button></div>}
    >
      <div className="space-y-4">
        {err && <Alert variant="error">{err}</Alert>}
        <EmployeePicker label="Sales Rep" required value={form.employee_id} onChange={v => set('employee_id', v)} placeholder="Choose a rep…" />
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Period</label>
          <div className="flex gap-2 flex-wrap">
            <SmallSelect value={form.period_type} onChange={e => set('period_type', e.target.value)}>
              {PERIOD_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </SmallSelect>
            <SmallSelect value={form.period_year} onChange={e => set('period_year', e.target.value)}>
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </SmallSelect>
            {form.period_type === 'monthly' && (
              <SmallSelect value={form.period_month} onChange={e => set('period_month', e.target.value)}>
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SmallSelect>
            )}
            {form.period_type === 'quarterly' && (
              <SmallSelect value={form.period_quarter} onChange={e => set('period_quarter', e.target.value)}>
                {['Q1','Q2','Q3','Q4'].map(q => <option key={q} value={q}>{q}</option>)}
              </SmallSelect>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Period key: <code className="bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-mono">{periodKey}</code></p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Target Value</label>
            <input type="number" min="0" className="form-input" placeholder="100000" value={form.target_value} onChange={e => set('target_value', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1.5">Currency</label>
            <SmallSelect value={form.currency} onChange={e => set('currency', e.target.value)}>
              {['USD','EUR','GBP','INR','CAD','AUD'].map(c => <option key={c} value={c}>{c}</option>)}
            </SmallSelect>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function ForecastPage() {
  const [objectId, setObjectId] = useState('');
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const qc     = useQueryClient();
  const empMap = useEmployeeMap();
  const { objects } = useAllObjects();

  // Auto-select opportunity object (or first object) on load
  useEffect(() => {
    if (objectId || !objects.length) return;
    const opp = objects.find(o => o.name?.toLowerCase().includes('opportunit')) ?? objects[0];
    if (opp) setObjectId(String(opp.id));
  }, [objects]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedObject = objects.find(o => String(o.id) === String(objectId));
  const moduleLabel    = selectedObject?.module?.label || selectedObject?.module?.name;
  const objectLabel    = selectedObject?.label || selectedObject?.name || '';

  const forecastQ = useQuery({
    queryKey: ['forecast', objectId],
    queryFn:  () => runtimeService.getForecast(objectId, { value_field: 'amount' }),
    enabled:  !!objectId,
  });
  const forecast = forecastQ.data?.data;

  const quotasQ = useQuery({
    queryKey: ['quotas', objectId],
    queryFn:  () => builderService.getQuotas({ object_id: objectId }),
    enabled:  !!objectId,
  });
  const quotas = quotasQ.data?.data ?? [];

  const deleteQuota = useMutation({
    mutationFn: (id) => builderService.deleteQuota(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['quotas'] }),
  });

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Forecast</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Weighted pipeline by stage and rep</p>
          </div>
        </div>
        {objectId && (
          <button
            onClick={() => forecastQ.refetch()}
            disabled={forecastQ.isFetching}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white/80 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw size={13} className={forecastQ.isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* ── Object selector ─────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
        <div className="flex items-end gap-4 flex-wrap">
          <ObjectPicker
            label="Forecasting for"
            value={objectId}
            onChange={setObjectId}
            wrapperClass="min-w-[220px]"
            placeholder="Choose an object…"
          />
          {selectedObject && (
            <div className="flex items-center gap-2 pb-0.5">
              {moduleLabel && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10">
                  {moduleLabel}
                </span>
              )}
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800">
                Revenue · amount
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!objectId && (
        <div className="text-center py-16 bg-white dark:bg-night-2 rounded-2xl border border-gray-200 dark:border-white/10">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-primary-300 dark:text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">Select an object to forecast</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
            Choose any object with a pipeline to view weighted revenue forecasts by stage and rep.
          </p>
        </div>
      )}

      {objectId && forecastQ.isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
      )}

      {/* ── Forecast data ───────────────────────────────────────────────── */}
      {forecast && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
              <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest font-medium mb-2">Total Pipeline</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{fmt(forecast.total_pipeline)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {forecast.by_stage?.reduce((s, r) => s + r.count, 0) ?? 0} open deals
              </p>
            </div>
            <div className="bg-gradient-to-br from-primary-50 to-accent-50 border border-primary-200 rounded-2xl p-5">
              <p className="text-xs text-primary-500 uppercase tracking-widest font-medium mb-2">Weighted Forecast</p>
              <p className="text-2xl font-bold text-primary-700 tracking-tight">{fmt(forecast.weighted_forecast)}</p>
              <p className="text-xs text-primary-400 mt-1">
                {forecast.total_pipeline > 0
                  ? `${Math.round((forecast.weighted_forecast / forecast.total_pipeline) * 100)}% of pipeline`
                  : 'Probability-adjusted'}
              </p>
            </div>
            <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={13} className="text-gray-400 dark:text-gray-500" />
                <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-widest font-medium">Active Reps</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{forecast.by_employee?.length ?? 0}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">with open opportunities</p>
            </div>
          </div>

          <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] flex items-center gap-2">
              <BarChart3 size={14} className="text-gray-400 dark:text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pipeline by Stage</h2>
            </div>
            <div className="p-6"><ForecastByStage byStage={forecast.by_stage} /></div>
          </div>

          {forecast.by_employee?.length > 0 && (
            <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] flex items-center gap-2">
                <Users size={14} className="text-gray-400 dark:text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">By Sales Rep</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-white/[0.07]">
                      <th className="px-6 py-3 font-medium">Rep</th>
                      <th className="px-6 py-3 font-medium text-right">Deals</th>
                      <th className="px-6 py-3 font-medium text-right">Pipeline</th>
                      <th className="px-6 py-3 font-medium text-right text-primary-600 dark:text-primary-400">Weighted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-white/10">
                    {forecast.by_employee.map(e => {
                      const ownerId = e.owner_id ?? e.employee_id;
                      const name    = empMap.get(ownerId);
                      return (
                        <tr key={ownerId ?? Math.random()} className="hover:bg-gray-50/60 dark:hover:bg-white/5">
                          <td className="px-6 py-3">
                            <p className="font-medium text-gray-800 dark:text-gray-200">{name || ownerId || '—'}</p>
                            {name && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{ownerId}</p>}
                          </td>
                          <td className="px-6 py-3 text-right text-gray-700 dark:text-gray-300">{e.count}</td>
                          <td className="px-6 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(e.amount ?? e.value)}</td>
                          <td className="px-6 py-3 text-right font-semibold text-primary-700 dark:text-primary-300">{fmt(e.weighted)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Quotas ──────────────────────────────────────────────────────── */}
      {objectId && (
        <div className="bg-white dark:bg-night-2 border border-gray-200 dark:border-white/10 rounded-2xl">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-primary-500 dark:text-primary-400" />
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Quotas
                {quotas.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                    {quotas.length}
                  </span>
                )}
              </h2>
            </div>
            <Button size="sm" onClick={() => setShowQuotaModal(true)}>
              <Plus size={13} /> Set Quota
            </Button>
          </div>
          {quotasQ.isLoading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : quotas.length === 0 ? (
            <div className="py-12 text-center">
              <Target size={28} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">No quotas set for {objectLabel || 'this object'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
                Quotas track each rep&apos;s revenue targets against their attainment.
              </p>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => setShowQuotaModal(true)}>
                <Plus size={13} /> Set first quota
              </Button>
            </div>
          ) : (
            <div className="px-6 py-2">
              {quotas.map(q => (
                <QuotaBar
                  key={q.id}
                  quota={q}
                  employeeName={empMap.get(q.employee_id)}
                  onDelete={() => deleteQuota.mutate(q.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showQuotaModal && objectId && (
        <QuotaModal objectId={objectId} onClose={() => setShowQuotaModal(false)} />
      )}
    </div>
  );
}
