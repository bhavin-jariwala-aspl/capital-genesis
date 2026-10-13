import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calculator, FileText, BarChart3, Mail, ArrowRight, ArrowLeft,
  DollarSign, Shield, ChevronDown,
  ChevronUp, TrendingUp, CheckCircle,
  History, ExternalLink, RefreshCw,
} from 'lucide-react';
import { insuranceService } from '../../services/insurance.service';
import { runtimeService } from '../../services/metadata.service';
import { useMetadataStore } from '../../store/metadataStore';
import { usePrefetchInsuranceFlow } from '../../hooks/usePrefetch';
import PDFViewer from '../../components/runtime/PDFViewer';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Alert from '../../components/ui/Alert';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import { fmtCurrency, fmtCurrencyPrecise } from '../../utils/formatters';

/* ── Constants ────────────────────────────────────────────── */

const COVERAGE_PRESETS = [
  { value: 100000, label: '$100K' },
  { value: 250000, label: '$250K' },
  { value: 500000, label: '$500K' },
  { value: 1000000, label: '$1M' },
];

const SMOKER_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'former', label: 'Former' },
  { value: 'current', label: 'Current' },
];

const HEALTH_CLASS_OPTIONS = [
  { value: 'preferred_plus', label: 'Preferred Plus' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'standard_plus', label: 'Standard Plus' },
  { value: 'standard', label: 'Standard' },
  { value: 'substandard', label: 'Substandard' },
];

const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
];

const TERM_OPTIONS = [
  { value: 10, label: '10 Years' },
  { value: 15, label: '15 Years' },
  { value: 20, label: '20 Years' },
  { value: 25, label: '25 Years' },
  { value: 30, label: '30 Years' },
];

/* ── Helpers ──────────────────────────────────────────────── */

// Money renders in the tenant's currency (BUILDER > Settings > Localization).
// This page shows "--" rather than the shared "—" placeholder for a blank.
const blankAsDashes = (s) => (s === '—' ? '--' : s);
const fmt    = (n) => blankAsDashes(fmtCurrencyPrecise(n));
const fmtInt = (n) => blankAsDashes(fmtCurrency(n));

function isTermProduct(productType) {
  return productType?.toLowerCase().includes('term');
}

/* ── Quote result normalizer ──────────────────────────────────
   Flattens the backend's nested snake_case response to the flat
   camelCase shape expected by the display sub-components while
   preserving the raw snake_case fields for template API calls.
*/
function normalizeQuoteResult(raw) {
  const total    = raw.premium?.total ?? {};
  const applicant = raw.applicant_summary ?? {};
  const product   = raw.product_details ?? {};
  const coverage  = raw.coverage ?? {};

  const riders = (raw.premium?.riders ?? []).map((r) => ({
    name:          r.rider_name,
    monthlyPremium: r.monthly_premium,
    monthlyRate:   r.monthly_premium,
  }));

  const annualPremium = total.annual ?? 0;
  const cashValueProjections = (raw.cash_value_projections ?? []).reduce((acc, p, i) => {
    const prevPremium = i > 0 ? acc[i - 1].premiumPaid : 0;
    const yearsSincePrev = i > 0 ? p.year - acc[i - 1].year : p.year;
    acc.push({
      year:         p.year,
      cashValue:    p.cash_value,
      premiumPaid:  prevPremium + yearsSincePrev * annualPremium,
      deathBenefit: coverage.death_benefit,
    });
    return acc;
  }, []);

  return {
    ...raw,                                          // keep raw fields for template API calls
    monthlyPremium:   total.monthly,
    annualPremium:    total.annual,
    deathBenefit:     coverage.death_benefit,
    productName:      product.name,
    productType:      product.type,
    termLength:       product.term_years,
    age:              applicant.age,
    gender:           applicant.gender,
    smokerStatus:     applicant.smoker_status,
    healthClass:      applicant.health_class,
    paymentFrequency: raw.premium?.selected_frequency,
    riders,
    cashValueProjections,
  };
}

function isPermanentProduct(productType) {
  const pt = productType?.toLowerCase() || '';
  return pt.includes('whole') || pt.includes('universal') || pt.includes('permanent');
}

/* ── Product Card ─────────────────────────────────────────── */

function ProductCard({ product, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product.type)}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-150 ${
        selected
          ? 'border-primary-500 bg-primary-50/50 ring-1 ring-primary-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-slate-800">{product.name}</span>
        {selected && <CheckCircle className="h-4 w-4 text-primary-600" />}
      </div>
      {product.description && (
        <p className="text-xs text-slate-500 leading-relaxed">{product.description}</p>
      )}
    </button>
  );
}

/* ── Coverage Preset Button ───────────────────────────────── */

function PresetButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-primary-600 text-on-primary shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

/* ── Rider Checkbox ───────────────────────────────────────── */

function RiderCheckbox({ rider, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 mt-0.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{rider.name}</span>
          {rider.monthlyRate && (
            <span className="text-xs text-slate-500">+{fmt(rider.monthlyRate)}/mo</span>
          )}
        </div>
        {rider.description && (
          <p className="text-xs text-slate-500 mt-0.5">{rider.description}</p>
        )}
      </div>
    </label>
  );
}

/* ── Premium Display Card ─────────────────────────────────── */

const RATE_SOURCE_LABEL = {
  internal:          { label: 'Internal Engine', className: 'text-primary-200' },
  carrier_api:       { label: 'Carrier API',     className: 'text-emerald-300' },
  simulated:         { label: 'Carrier Simulated', className: 'text-amber-300' },
  internal_fallback: { label: 'Fallback (Internal)', className: 'text-orange-300' },
};

function PremiumCard({ quote }) {
  if (!quote) return null;

  const rateInfo = RATE_SOURCE_LABEL[quote.rate_source]
    ?? { label: quote.rate_source ?? 'Internal Engine', className: 'text-primary-200' };
  const adapterName = quote.rate_source_meta?.adapter || quote.rate_source_meta?.carrier_name;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-slate-800 p-6 text-on-primary">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative">
        <p className="text-primary-200 text-xs font-medium uppercase tracking-wider mb-1">
          Estimated Premium
        </p>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-bold tracking-tight">
            {fmt(quote.monthlyPremium)}
          </span>
          <span className="text-primary-200 text-sm">/month</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-primary-200 text-xs mb-0.5">Annual Premium</p>
            <p className="text-lg font-semibold">{fmt(quote.annualPremium)}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-primary-200 text-xs mb-0.5">Death Benefit</p>
            <p className="text-lg font-semibold">{fmtInt(quote.deathBenefit)}</p>
          </div>
        </div>

        {/* Rate source attribution */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
          <span className={`text-xs font-medium ${rateInfo.className}`}>
            {rateInfo.label}
            {adapterName && adapterName !== rateInfo.label ? ` · ${adapterName}` : ''}
          </span>
          {quote.rate_source_meta?.rated_at && (
            <span className="text-xs text-primary-300">
              {new Date(quote.rate_source_meta.rated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Quote Details Table ──────────────────────────────────── */

function QuoteDetailsTable({ quote }) {
  if (!quote) return null;

  const rows = [
    { label: 'Policy Type', value: quote.productName || quote.productType },
    { label: 'Death Benefit', value: fmtInt(quote.deathBenefit) },
    { label: 'Underwriting Class', value: quote.healthClass?.replace(/_/g, ' ') },
    quote.termLength && { label: 'Term Length', value: `${quote.termLength} Years` },
    { label: 'Payment Frequency', value: quote.paymentFrequency?.replace(/_/g, ' ') },
    { label: 'Applicant Age', value: quote.age },
    { label: 'Gender', value: quote.gender },
    { label: 'Smoker Status', value: quote.smokerStatus },
  ].filter(Boolean);

  return (
    <Card title="Quote Details">
      <div className="divide-y divide-slate-100">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-500">{row.label}</span>
            <span className="font-medium text-slate-800 capitalize">{row.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Rider Premiums Card ──────────────────────────────────── */

function RiderPremiumsCard({ riders }) {
  if (!riders || riders.length === 0) return null;

  const total = riders.reduce((sum, r) => sum + (r.monthlyPremium || 0), 0);

  return (
    <Card title="Rider Premiums">
      <div className="divide-y divide-slate-100">
        {riders.map((rider, i) => (
          <div key={i} className="flex items-center justify-between py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-primary-500" />
              <span className="text-slate-700">{rider.name}</span>
            </div>
            <span className="font-medium text-slate-800">{fmt(rider.monthlyPremium)}/mo</span>
          </div>
        ))}
        <div className="flex items-center justify-between py-2.5 text-sm font-semibold">
          <span className="text-slate-700">Total Rider Premium</span>
          <span className="text-primary-600">{fmt(total)}/mo</span>
        </div>
      </div>
    </Card>
  );
}

/* ── Cash Value Projection Table ──────────────────────────── */

function CashValueProjection({ projections }) {
  const [expanded, setExpanded] = useState(false);

  if (!projections || projections.length === 0) return null;

  const displayed = expanded ? projections : projections.slice(0, 10);

  return (
    <Card
      title="Cash Value Projection"
      actions={
        projections.length > 10 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            {expanded ? 'Show Less' : `Show All (${projections.length})`}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Year</th>
              <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Premium Paid</th>
              <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cash Value</th>
              <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Death Benefit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {displayed.map((row) => (
              <tr key={row.year} className="hover:bg-slate-50/50">
                <td className="py-2 text-slate-700 font-medium">{row.year}</td>
                <td className="py-2 text-right text-slate-600">{fmtInt(row.premiumPaid)}</td>
                <td className="py-2 text-right text-primary-600 font-medium">{fmtInt(row.cashValue)}</td>
                <td className="py-2 text-right text-slate-600">{fmtInt(row.deathBenefit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Comparison Modal ─────────────────────────────────────── */

function ComparisonModal({ open, onClose, products, currentFormData }) {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [comparisonResult, setComparisonResult] = useState(null);

  const compareMutation = useMutation({
    mutationFn: (quotes) => insuranceService.compareQuotes(quotes),
    onSuccess: (data) => setComparisonResult(data),
  });

  const pdfMutation = useMutation({
    mutationFn: ({ quotes, client }) => insuranceService.renderComparisonReport(quotes, client),
    onSuccess: (html) => {
      const win = window.open('', '_blank');
      if (win) { win.document.open(); win.document.write(typeof html === 'string' ? html : ''); win.document.close(); win.document.title = 'Product Comparison'; }
    },
  });

  const toggleProduct = (productType) => {
    setSelectedProducts((prev) => {
      if (prev.includes(productType)) return prev.filter((p) => p !== productType);
      if (prev.length >= 4) return prev;
      return [...prev, productType];
    });
  };

  const handleCompare = () => {
    if (selectedProducts.length < 2) return;
    const quotes = selectedProducts.map((productType) => ({
      productType,
      coverageAmount: currentFormData.coverageAmount,
      age: currentFormData.age,
      gender: currentFormData.gender,
      smokerStatus: currentFormData.smokerStatus,
      healthClass: currentFormData.healthClass,
      paymentFrequency: currentFormData.paymentFrequency,
      termLength: isTermProduct(productType) ? (currentFormData.termLength || 20) : undefined,
    }));
    compareMutation.mutate(quotes);
  };

  const handleGeneratePdf = () => {
    if (!comparisonResult) return;
    pdfMutation.mutate({
      quotes: comparisonResult.quotes || comparisonResult,
      client: {
        age: currentFormData.age,
        gender: currentFormData.gender,
        smokerStatus: currentFormData.smokerStatus,
        healthClass: currentFormData.healthClass,
      },
    });
  };

  const handleClose = () => {
    setSelectedProducts([]);
    setComparisonResult(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Compare Products"
      size="xl"
      footer={
        <div className="flex items-center gap-2">
          {comparisonResult && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGeneratePdf}
              loading={pdfMutation.isPending}
            >
              <FileText className="h-3.5 w-3.5" />
              Generate Comparison PDF
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Close
          </Button>
          {!comparisonResult && (
            <Button
              size="sm"
              onClick={handleCompare}
              disabled={selectedProducts.length < 2}
              loading={compareMutation.isPending}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Compare ({selectedProducts.length} selected)
            </Button>
          )}
        </div>
      }
    >
      {!comparisonResult ? (
        <div>
          <p className="text-sm text-slate-600 mb-4">
            Select 2 to 4 products to compare side by side. All quotes will use the same
            applicant information from your current form.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(products || []).map((product) => (
              <button
                key={product.type}
                type="button"
                onClick={() => toggleProduct(product.type)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  selectedProducts.includes(product.type)
                    ? 'border-primary-500 bg-primary-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                } ${selectedProducts.length >= 4 && !selectedProducts.includes(product.type)
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
                disabled={
                  selectedProducts.length >= 4 && !selectedProducts.includes(product.type)
                }
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-slate-800">{product.name}</span>
                  {selectedProducts.includes(product.type) && (
                    <CheckCircle className="h-4 w-4 text-primary-600" />
                  )}
                </div>
                <p className="text-xs text-slate-500">{product.description}</p>
              </button>
            ))}
          </div>
          {compareMutation.isError && (
            <Alert type="error" className="mt-4">
              Failed to compare products. Please try again.
            </Alert>
          )}
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Feature
                  </th>
                  {(Array.isArray(comparisonResult?.quotes) ? comparisonResult.quotes : []).map((q, i) => (
                    <th key={i} className="text-center py-3 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {q.productName || q.productType}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: 'Monthly Premium', key: 'monthlyPremium', format: fmt },
                  { label: 'Annual Premium', key: 'annualPremium', format: fmt },
                  { label: 'Death Benefit', key: 'deathBenefit', format: fmtInt },
                  { label: 'Cash Value (Yr 10)', key: 'cashValue10', format: fmtInt },
                  { label: 'Cash Value (Yr 20)', key: 'cashValue20', format: fmtInt },
                  { label: 'Policy Type', key: 'productType', format: (v) => v?.replace(/_/g, ' ') },
                  { label: 'Term Length', key: 'termLength', format: (v) => v ? `${v} Years` : 'N/A' },
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50/50">
                    <td className="py-2.5 pr-4 text-slate-600 font-medium">{row.label}</td>
                    {(Array.isArray(comparisonResult?.quotes) ? comparisonResult.quotes : []).map((q, i) => (
                      <td key={i} className="py-2.5 px-3 text-center text-slate-800">
                        {row.format(q[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pdfMutation.isSuccess && (
            <Alert type="success" className="mt-4">Comparison report opened in a new tab.</Alert>
          )}

          <div className="flex justify-center mt-4">
            <Button variant="secondary" size="sm" onClick={() => setComparisonResult(null)}>
              Back to Selection
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Saved Scenarios Panel ────────────────────────────────────
   Surfaces persisted QuoteScenarios from the backend so agents
   can review past quotes, reopen parameters, or convert to app.
*/

const STATUS_BADGE = {
  active:    { variant: 'success', label: 'Active' },
  expired:   { variant: 'warning', label: 'Expired' },
  converted: { variant: 'info',    label: 'Converted' },
};

const SOURCE_LABEL = {
  internal:          'Internal Engine',
  carrier_api:       'Carrier API',
  simulated:         'Simulated',
  internal_fallback: 'Internal (Fallback)',
};

function SavedScenarios({ onReopen, onConvert }) {
  const [expanded, setExpanded] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const scenariosQuery = useQuery({
    queryKey: ['quote-scenarios'],
    queryFn: () => insuranceService.listScenarios({ limit: 20 }),
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ['quote-scenario', detailId],
    queryFn: () => insuranceService.getScenario(detailId),
    enabled: !!detailId,
  });

  const scenarios = scenariosQuery.data?.data?.scenarios
    ?? scenariosQuery.data?.scenarios ?? [];
  const total = scenariosQuery.data?.data?.total
    ?? scenariosQuery.data?.total ?? 0;

  if (scenariosQuery.isLoading) return null;
  if (!scenarios.length) return null;

  const detail = detailQuery.data?.data ?? detailQuery.data;
  const isExpired = (s) => s.status === 'expired' || new Date(s.valid_until) < new Date();

  return (
    <Card
      title={
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <History className="h-4 w-4 text-primary-500" />
          <span className="text-sm font-semibold text-slate-800">
            Saved Scenarios ({total})
          </span>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 ml-auto" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-auto" />}
        </button>
      }
    >
      {!expanded ? (
        <p className="text-xs text-slate-500">
          Click to view {total} saved quote scenario{total !== 1 ? 's' : ''}.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Scenario list */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {scenarios.map((s) => {
              const badge = STATUS_BADGE[isExpired(s) ? 'expired' : s.status] || STATUS_BADGE.active;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 cursor-pointer transition-colors ${
                    detailId === s.id ? 'bg-primary-50/50' : ''
                  }`}
                  onClick={() => setDetailId(detailId === s.id ? null : s.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-slate-800 truncate">
                        {s.scenario_ref}
                      </span>
                      <Badge variant={badge.variant} size="xs">{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="capitalize">{s.product_type?.replace(/_/g, ' ')}</span>
                      <span>{fmtInt(s.coverage_amount)}</span>
                      <span>{fmt(s.monthly_premium)}/mo</span>
                      <span className="hidden sm:inline">
                        {SOURCE_LABEL[s.rate_source] || s.rate_source}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Reopen scenario"
                      onClick={(e) => { e.stopPropagation(); onReopen(s); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    {s.status === 'active' && !isExpired(s) && (
                      <button
                        type="button"
                        title="Convert to application"
                        onClick={(e) => { e.stopPropagation(); onConvert(s); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scenario detail panel */}
          {detailId && detail && (
            <div className="border border-primary-200 rounded-xl bg-primary-50/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-800">
                  {detail.scenario_ref}
                </h4>
                <button
                  type="button"
                  onClick={() => setDetailId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Product</span>
                  <p className="font-medium text-slate-800 capitalize">
                    {detail.product_type?.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Coverage</span>
                  <p className="font-medium text-slate-800">{fmtInt(detail.coverage_amount)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Monthly Premium</span>
                  <p className="font-medium text-slate-800">{fmt(detail.monthly_premium)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Annual Premium</span>
                  <p className="font-medium text-slate-800">{fmt(detail.annual_premium)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Rate Source</span>
                  <p className="font-medium text-slate-800">
                    {SOURCE_LABEL[detail.rate_source] || detail.rate_source}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Valid Until</span>
                  <p className="font-medium text-slate-800">
                    {new Date(detail.valid_until).toLocaleDateString()}
                  </p>
                </div>
                {detail.term_years && (
                  <div>
                    <span className="text-slate-500">Term</span>
                    <p className="font-medium text-slate-800">{detail.term_years} Years</p>
                  </div>
                )}
                {detail.comparison_group && (
                  <div>
                    <span className="text-slate-500">Comparison Group</span>
                    <p className="font-medium text-slate-800 truncate">{detail.comparison_group}</p>
                  </div>
                )}
                {detail.contact && (
                  <div>
                    <span className="text-slate-500">Contact</span>
                    <p className="font-medium text-slate-800">
                      {detail.contact.first_name} {detail.contact.last_name}
                    </p>
                  </div>
                )}
                {detail.application && (
                  <div>
                    <span className="text-slate-500">Application</span>
                    <p className="font-medium text-slate-800">
                      {detail.application.app_number} ({detail.application.status})
                    </p>
                  </div>
                )}
              </div>

              {detail.rate_source_meta && (
                <div className="text-xs text-slate-500 bg-white/60 rounded-lg p-2">
                  <span className="font-medium">Rate Metadata:</span>{' '}
                  Adapter: {detail.rate_source_meta.adapter || '--'},
                  Version: {detail.rate_source_meta.version || '--'},
                  Rated: {detail.rate_source_meta.rated_at
                    ? new Date(detail.rate_source_meta.rated_at).toLocaleString()
                    : '--'}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onReopen(detail)}
                >
                  <RefreshCw className="h-3 w-3" />
                  Reopen in Form
                </Button>
                {detail.status === 'active' && new Date(detail.valid_until) >= new Date() && (
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => onConvert(detail)}
                  >
                    <ArrowRight className="h-3 w-3" />
                    Convert to Application
                  </Button>
                )}
              </div>
            </div>
          )}

          {detailId && detailQuery.isLoading && (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════
   ██  MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function InsuranceQuotePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Prefetch insurance flow metadata so Apply Now navigates instantly
  usePrefetchInsuranceFlow();

  /* ── local state ──────────────────────────────────────────── */
  const [quoteResult, setQuoteResult] = useState(null);
  // null | { content: string, title: string } — drives the full-screen PDF view
  const [pdfScreen, setPdfScreen] = useState(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [selectedRiders, setSelectedRiders] = useState([]);
  // Quote report must be viewed before Apply Now is enabled
  const [quoteReportViewed, setQuoteReportViewed] = useState(false);

  /* ── react-hook-form ──────────────────────────────────────── */
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
    getValues,
  } = useForm({
    defaultValues: {
      productType: '',
      coverageAmount: 250000,
      termLength: 20,
      age: '',
      gender: 'male',
      smokerStatus: 'never',
      healthClass: 'standard',
      paymentFrequency: 'monthly',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
    },
  });

  const watchProductType = watch('productType');
  const watchCoverage = watch('coverageAmount');

  /* ── Pre-fill from URL params (Client → Get Quote flow) ─── */
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const age = searchParams.get('age');
    const gender = searchParams.get('gender');
    const smoker = searchParams.get('smokerStatus');
    const health = searchParams.get('healthClass');
    const coverage = searchParams.get('coverageAmount');
    const clientName = searchParams.get('clientName') || '';
    const clientEmail = searchParams.get('clientEmail');
    if (age)      setValue('age', Number(age));
    if (gender)   setValue('gender', gender);
    if (smoker)   setValue('smokerStatus', smoker);
    if (health)   setValue('healthClass', health);
    if (coverage) setValue('coverageAmount', Number(coverage));
    if (clientName) {
      const parts = clientName.split(' ');
      setValue('firstName', parts[0] || '');
      setValue('lastName', parts.slice(1).join(' ') || '');
    }
    if (clientEmail) setValue('email', clientEmail);
    const phone = searchParams.get('clientPhone');
    if (phone) setValue('phone', phone);
    const dob = searchParams.get('dateOfBirth');
    if (dob) setValue('dateOfBirth', dob);
  }, [searchParams, setValue]);

  /* ── queries ──────────────────────────────────────────────── */
  const productsQuery = useQuery({
    queryKey: ['insurance-products'],
    queryFn: insuranceService.getProducts,
    staleTime: 5 * 60 * 1000,
  });

  const ridersQuery = useQuery({
    queryKey: ['insurance-riders', watchProductType],
    queryFn: () => insuranceService.getRiders(watchProductType),
    enabled: !!watchProductType,
    staleTime: 5 * 60 * 1000,
  });

  /* ── mutations ────────────────────────────────────────────── */
  const calculateMutation = useMutation({
    mutationFn: insuranceService.calculateQuote,
    onSuccess: (data) => {
      setQuoteResult(normalizeQuoteResult(data));
      setPdfScreen(null);
      setQuoteReportViewed(false);
      queryClient.invalidateQueries({ queryKey: ['quote-scenarios'] });
    },
  });

  const quotePdfMutation = useMutation({
    mutationFn: ({ calculation, client, agent }) =>
      insuranceService.renderQuoteSummary(calculation, client, agent),
    onSuccess: (html) => {
      if (typeof html === 'string') {
        setPdfScreen({ content: html, title: 'Insurance Quote' });
        setQuoteReportViewed(true);
      }
    },
  });

  const illustrationMutation = useMutation({
    mutationFn: ({ calculation, client }) =>
      insuranceService.renderIllustration(calculation, client),
    onSuccess: (html) => {
      if (typeof html === 'string') {
        setPdfScreen({ content: html, title: 'Policy Illustration' });
      }
    },
  });

  const emailMutation = useMutation({
    mutationFn: async ({ calculation, client, agent }) => {
      // Render quote HTML then send with PDF attachment
      const rendered = await insuranceService.renderQuoteSummary(calculation, client, agent);
      const html = typeof rendered === 'string' ? rendered : '';
      return api.post('/email/send-with-pdf', {
        to_email:    client.email,
        subject:     `Your Life Insurance Quote — ${calculation?.quote_reference || ''}`,
        body_text:   'Please find your personalised life insurance quote attached as a PDF.',
        pdf_html:    html,
        pdf_filename: `Quote-${calculation?.quote_reference || Date.now()}.pdf`,
      }).then(r => r.data);
    },
  });

  /* ── reset riders when product changes ────────────────────── */
  const handleProductSelect = useCallback(
    (type) => {
      setValue('productType', type, { shouldValidate: true });
      setSelectedRiders([]);
      setQuoteResult(null);
      setPdfScreen(null);
      setQuoteReportViewed(false);
    },
    [setValue],
  );

  /* ── toggle rider ─────────────────────────────────────────── */
  const toggleRider = useCallback((riderId) => {
    setSelectedRiders((prev) =>
      prev.includes(riderId) ? prev.filter((r) => r !== riderId) : [...prev, riderId],
    );
  }, []);

  /* ── submit ───────────────────────────────────────────────── */
  const onSubmit = (data) => {
    // Use watchProductType (from RHF watch) as the canonical source for product type
    // since hidden inputs can have DOM sync issues with setValue in some RHF versions.
    const productType = watchProductType || data.productType;
    if (!productType) return; // guard: should not be reachable due to required validation

    const payload = {
      product_type: productType,
      coverage_amount: Number(data.coverageAmount),
      payment_frequency: data.paymentFrequency,
      riders: selectedRiders,
      applicant: {
        age: Number(data.age),
        gender: data.gender,
        smoker_status: data.smokerStatus,
        health_class: data.healthClass,
      },
    };
    if (isTermProduct(productType)) {
      payload.term_years = Number(data.termLength);
    }
    // Pass contact record ID so the backend can link the quote to the contact
    const contactRecordId = searchParams.get('contactRecordId');
    if (contactRecordId) payload.contact_record_id = Number(contactRecordId);
    calculateMutation.mutate(payload);
  };

  /* ── generate quote PDF ───────────────────────────────────── */
  const handleGenerateQuotePdf = () => {
    if (!quoteResult) return;
    const data = getValues();
    quotePdfMutation.mutate({
      calculation: quoteResult,
      client: {
        age: Number(data.age),
        gender: data.gender,
        smokerStatus: data.smokerStatus,
        healthClass: data.healthClass,
      },
      agent: {},
    });
  };

  /* ── generate illustration ────────────────────────────────── */
  const handleGenerateIllustration = () => {
    if (!quoteResult) return;
    const data = getValues();
    illustrationMutation.mutate({
      calculation: quoteResult,
      client: {
        age: Number(data.age),
        gender: data.gender,
        smokerStatus: data.smokerStatus,
        healthClass: data.healthClass,
      },
    });
  };

  /* ── email to client ──────────────────────────────────────── */
  const handleEmailToClient = () => {
    if (!quoteResult) return;
    const data = getValues();
    emailMutation.mutate({
      calculation: quoteResult,
      client: {
        age: Number(data.age),
        gender: data.gender,
        smokerStatus: data.smokerStatus,
        healthClass: data.healthClass,
      },
      agent: {},
    });
  };

  /* ── scenario: reopen ─────────────────────────────────────── */
  const handleReopenScenario = useCallback((scenario) => {
    const app = scenario.applicant_data || {};
    setValue('productType', scenario.product_type || '');
    setValue('coverageAmount', Number(scenario.coverage_amount) || 250000);
    setValue('age', app.age || '');
    setValue('gender', app.gender || 'male');
    setValue('smokerStatus', app.smoker_status || 'never');
    setValue('healthClass', app.health_class || 'standard');
    setValue('paymentFrequency', scenario.payment_frequency || 'monthly');
    if (scenario.term_years) setValue('termLength', scenario.term_years);
    setSelectedRiders(Array.isArray(scenario.riders) ? scenario.riders : []);
    setQuoteResult(null);
    setPdfScreen(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setValue]);

  /* ── scenario: convert to application ────────────────────── */
  const handleConvertScenario = useCallback(async (scenario) => {
    try {
      // First reopen the scenario to populate the form
      handleReopenScenario(scenario);
      // Calculate the quote to get a fresh result, then user can click Apply Now
      const payload = {
        product_type: scenario.product_type,
        coverage_amount: Number(scenario.coverage_amount),
        payment_frequency: scenario.payment_frequency || 'monthly',
        riders: Array.isArray(scenario.riders) ? scenario.riders : [],
        applicant: scenario.applicant_data || {},
      };
      if (scenario.term_years) payload.term_years = scenario.term_years;
      calculateMutation.mutate(payload);
      // Invalidate scenarios cache so status updates appear
      queryClient.invalidateQueries({ queryKey: ['quote-scenarios'] });
    } catch {
      // Fallback: just reopen the form
    }
  }, [handleReopenScenario, calculateMutation, queryClient]);

  /* ── start application ────────────────────────────────────── */
  const [applyError, setApplyError] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const handleStartApplication = async () => {
    if (quoteResult?.wizardId) {
      navigate(`/wizard/${quoteResult.wizardId}`);
      return;
    }
    setApplyLoading(true);
    setApplyError(null);
    try {
      // 1. Resolve application object IDs — instant from MetadataStore, fallback to API
      let resolvedData = useMetadataStore.getState().getResolved('application');
      if (!resolvedData) {
        const resolved = await runtimeService.resolveObject('application');
        resolvedData = resolved?.data ?? resolved ?? {};
        // Cache for next time
        useMetadataStore.getState().setResolved('application', resolvedData);
      }
      const { object_id, first_stage_id, wizard_id } = resolvedData;
      if (!object_id) throw new Error('Application object not found in metadata');

      // 2. Create a CRM record with quote data
      const data = getValues();
      const now = new Date().toISOString().slice(0, 10);
      const appNum = `APP-${now.slice(0, 4)}-${String(Date.now()).slice(-6)}`;
      const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
      // Saved as a draft: the wizard collects the remaining required fields, so
      // the server validates only what is sent. Blank values are dropped — a
      // blank that IS sent still fails its required check.
      const record = await runtimeService.createRecord({
        object_id,
        stage_id: first_stage_id,
        draft: true,
        data: Object.fromEntries(Object.entries({
          application_number: appNum,
          product_type:       data.productType || quoteResult?.productType || '',
          coverage_amount:    String(Number(data.coverageAmount) || quoteResult?.deathBenefit || ''),
          premium:            String(quoteResult?.monthlyPremium ?? quoteResult?.annualPremium ?? ''),
          submitted_date:     now,
          status:             'submitted',
          applicant_name:     fullName,
          wiz_first_name:      data.firstName || '',
          wiz_last_name:       data.lastName || '',
          wiz_email:           data.email || '',
          wiz_phone:           data.phone || '',
          wiz_dob:             data.dateOfBirth || '',
          wiz_age:             String(data.age || ''),
          wiz_gender:          data.gender || '',
          wiz_smoker_status:   data.smokerStatus || 'never',
          wiz_health_class:    data.healthClass || 'standard',
          wiz_coverage_amount: String(Number(data.coverageAmount) || ''),
          wiz_product_type:    data.productType || '',
          wiz_term_years:      String(data.termLength || ''),
          wiz_payment_frequency: data.paymentFrequency || 'monthly',
          notes:              `From Quote Engine — ${quoteResult?.productName || data.productType}, Coverage: $${Number(data.coverageAmount).toLocaleString()}`,
        }).filter(([, v]) => v !== '')),
      });

      // 3. Archive the quote report against the newly created application.
      //    The CRM record creation triggers #syncInsuranceApplication which
      //    upserts an InsuranceApplication linked by record_id. Look it up
      //    and fire-and-forget the archive call so it doesn't block navigation.
      const recId = record?.data?.id ?? record?.id;
      if (recId && quoteResult) {
        // Find the InsuranceApplication created by the domain sync
        insuranceService.listApplications({ search: appNum }).then(res => {
          const apps = res?.data?.applications ?? res?.applications ?? [];
          const app = apps.find(a => a.app_number === appNum);
          if (app?.id) {
            insuranceService.renderAndArchive({
              report_type: 'quote_report',
              application_id: app.id,
              calculation: quoteResult,
              client: {
                age: Number(data.age),
                gender: data.gender,
                smokerStatus: data.smokerStatus,
                healthClass: data.healthClass,
              },
              agent: {},
            }).catch(() => {}); // fire-and-forget
          }
        }).catch(() => {});
      }

      // 4. Navigate to wizard (if exists) or insurance applications
      if (wizard_id && recId) {
        navigate(`/wizard/${wizard_id}?record_id=${recId}`);
      } else {
        navigate('/insurance/applications');
      }
    } catch (err) {
      setApplyError(err?.response?.data?.message ?? err?.message ?? 'Failed to create application');
    } finally {
      setApplyLoading(false);
    }
  };

  /* ────────────────────────────────────────────────────────────
     RENDER — full-screen PDF view (replaces page when active)
     ──────────────────────────────────────────────────────────── */
  if (pdfScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-night-0">
        {/* Back bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-night-3
                        border-b border-gray-200 dark:border-white/10 shrink-0 shadow-sm">
          <button
            onClick={() => setPdfScreen(null)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium
                       text-gray-600 dark:text-white/60 hover:text-gray-900
                       dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10
                       rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Quote
          </button>
          <span className="text-gray-300 dark:text-white/20 select-none">|</span>
          <h1 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {pdfScreen.title}
          </h1>
        </div>

        {/* PDFViewer fills the remainder of the viewport */}
        <div className="flex-1 min-h-0">
          <PDFViewer
            content={pdfScreen.content}
            title={pdfScreen.title}
            clientEmail={getValues('email')}
            className="h-full"
          />
        </div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────
     RENDER — main quote page
     ──────────────────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50">

      {/* ── Header (fixed) ────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl
                          bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Quote Generator</h1>
            <p className="text-sm text-slate-500">
              Generate life insurance quotes, illustrations, and comparison reports
            </p>
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

          {/* Form — cards in a responsive grid */}
          <form id="quote-form" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

              {/* Product Type — full width row */}
              <div className="col-span-full">
                <Card title="Product Type">
                  {productsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Spinner size="md" />
                    </div>
                  ) : productsQuery.isError ? (
                    <Alert type="error">Failed to load products. Please refresh the page.</Alert>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {(productsQuery.data || []).map((product) => (
                        <ProductCard
                          key={product.type}
                          product={product}
                          selected={watchProductType === product.type}
                          onSelect={handleProductSelect}
                        />
                      ))}
                      <input
                        type="hidden"
                        {...register('productType', { required: 'Please select a product type' })}
                      />
                      {errors.productType && (
                        <p className="col-span-full form-error">{errors.productType.message}</p>
                      )}
                    </div>
                  )}
                </Card>
              </div>

              {/* Coverage Amount */}
              <Card title="Coverage Amount">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {COVERAGE_PRESETS.map((preset) => (
                      <PresetButton
                        key={preset.value}
                        label={preset.label}
                        active={Number(watchCoverage) === preset.value}
                        onClick={() =>
                          setValue('coverageAmount', preset.value, { shouldValidate: true })
                        }
                      />
                    ))}
                  </div>
                  <Input
                    label="Custom Amount"
                    prefix="$"
                    type="number"
                    step={1000}
                    min={25000}
                    max={10000000}
                    error={errors.coverageAmount?.message}
                    {...register('coverageAmount', {
                      required: 'Coverage amount is required',
                      valueAsNumber: true,
                      min: { value: 25000, message: 'Minimum coverage is $25,000' },
                      max: { value: 10000000, message: 'Maximum coverage is $10,000,000' },
                    })}
                  />
                  <p className="text-xs text-slate-400">Range: $25,000 – $10,000,000</p>
                </div>
              </Card>

              {/* Contact Details */}
              <Card title="Contact Details">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      required
                      placeholder="First name"
                      error={errors.firstName?.message}
                      {...register('firstName', { required: 'First name is required' })}
                    />
                    <Input
                      label="Last Name"
                      required
                      placeholder="Last name"
                      error={errors.lastName?.message}
                      {...register('lastName', { required: 'Last name is required' })}
                    />
                  </div>
                  <Input
                    label="Email"
                    type="email"
                    placeholder="email@example.com"
                    error={errors.email?.message}
                    {...register('email', {
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email address' },
                    })}
                  />
                  <Input
                    label="Phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...register('phone')}
                  />
                  <Input
                    label="Date of Birth"
                    type="date"
                    error={errors.dateOfBirth?.message}
                    {...register('dateOfBirth')}
                  />
                </div>
              </Card>

              {/* Applicant Information */}
              <Card title="Applicant Information">
                <div className="space-y-4">
                  <Input
                    label="Age"
                    type="number"
                    min={18}
                    max={85}
                    step={1}
                    required
                    placeholder="Enter age (18–85)"
                    error={errors.age?.message}
                    {...register('age', {
                      required: 'Age is required',
                      valueAsNumber: true,
                      validate: {
                        integer: (v) => Number.isInteger(v) || 'Age must be a whole number',
                        min: (v) => v >= 18 || 'Minimum age is 18',
                        max: (v) => v <= 85 || 'Maximum age is 85',
                      },
                    })}
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Gender<span className="ml-0.5 text-red-500">*</span>
                    </label>
                    <Controller
                      name="gender"
                      control={control}
                      render={({ field }) => (
                        <div className="flex gap-4">
                          {[
                            { value: 'male', label: 'Male' },
                            { value: 'female', label: 'Female' },
                          ].map((opt) => (
                            <label
                              key={opt.value}
                              className="flex items-center gap-2 cursor-pointer select-none"
                            >
                              <input
                                type="radio"
                                name="gender"
                                value={opt.value}
                                checked={field.value === opt.value}
                                onChange={() => field.onChange(opt.value)}
                                className="h-4 w-4 border-gray-300 dark:border-gray-600 text-primary-600
                                           focus:ring-primary-500 focus:ring-offset-0"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    />
                  </div>
                  <Select
                    label="Smoker Status"
                    required
                    options={SMOKER_OPTIONS}
                    error={errors.smokerStatus?.message}
                    {...register('smokerStatus', { required: 'Smoker status is required' })}
                  />
                  <Select
                    label="Health Class"
                    required
                    options={HEALTH_CLASS_OPTIONS}
                    error={errors.healthClass?.message}
                    {...register('healthClass', { required: 'Health class is required' })}
                  />
                </div>
              </Card>

              {/* Payment Frequency */}
              <Card title="Payment Frequency">
                <Controller
                  name="paymentFrequency"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2">
                      {PAYMENT_FREQUENCIES.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => field.onChange(opt.value)}
                          className={`px-3 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                            field.value === opt.value
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </Card>

              {/* Term Length — conditional */}
              {isTermProduct(watchProductType) && (
                <Card title="Term Length">
                  <Controller
                    name="termLength"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-2">
                        {TERM_OPTIONS.map((opt) => (
                          <PresetButton
                            key={opt.value}
                            label={opt.label}
                            active={Number(field.value) === opt.value}
                            onClick={() => field.onChange(opt.value)}
                          />
                        ))}
                      </div>
                    )}
                  />
                </Card>
              )}

              {/* Optional Riders — conditional */}
              {watchProductType && (
                <Card title="Optional Riders">
                  {ridersQuery.isLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Spinner size="sm" />
                    </div>
                  ) : ridersQuery.isError ? (
                    <Alert type="warning">Could not load riders for this product.</Alert>
                  ) : !ridersQuery.data || ridersQuery.data.length === 0 ? (
                    <p className="text-sm text-slate-500 py-2">
                      No riders available for this product.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {ridersQuery.data.map((rider) => (
                        <RiderCheckbox
                          key={rider.key || rider.code}
                          rider={rider}
                          checked={selectedRiders.includes(rider.key || rider.code)}
                          onChange={() => toggleRider(rider.key || rider.code)}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              )}

            </div>

            {/* Calculation error — below the grid */}
            {calculateMutation.isError && (
              <div className="mt-4">
                <Alert type="error" title="Calculation Failed">
                  {calculateMutation.error?.response?.data?.error?.message ||
                    calculateMutation.error?.response?.data?.message ||
                    calculateMutation.error?.message ||
                    'An error occurred while calculating the premium. Please check your inputs and try again.'}
                </Alert>
              </div>
            )}
          </form>

          {/* Calculating… spinner */}
          {calculateMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Spinner size="lg" />
              <p className="text-sm text-slate-500 mt-4">Calculating your premium…</p>
            </div>
          )}

          {/* Empty state */}
          {!quoteResult && !calculateMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl
                              bg-slate-100 text-slate-400 mb-4">
                <DollarSign className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700 mb-1">No Quote Yet</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Fill in the fields above and click{' '}
                <strong>Calculate Premium</strong> to generate a personalised quote.
              </p>
            </div>
          )}

          {/* Quote Results */}
          {quoteResult && !calculateMutation.isPending && (
            <div className="space-y-5 pb-4">
              {/* Action alerts */}
              {emailMutation.isSuccess && (
                <Alert type="success" title="Email Sent">
                  The quote summary PDF has been emailed to the client.
                </Alert>
              )}
              {quotePdfMutation.isError && (
                <Alert type="error">Failed to generate Quote PDF. Please try again.</Alert>
              )}
              {illustrationMutation.isError && (
                <Alert type="error">Failed to generate Illustration. Please try again.</Alert>
              )}
              {emailMutation.isError && (
                <Alert type="error">Failed to send email. Please try again.</Alert>
              )}

              <PremiumCard quote={quoteResult} />
              <QuoteDetailsTable quote={quoteResult} />
              <RiderPremiumsCard riders={quoteResult.riders} />
              {isPermanentProduct(quoteResult.productType) &&
                quoteResult.cashValueProjections && (
                  <CashValueProjection projections={quoteResult.cashValueProjections} />
                )}
            </div>
          )}

          {/* Saved Quote Scenarios */}
          <SavedScenarios
            onReopen={handleReopenScenario}
            onConvert={handleConvertScenario}
          />

        </div>
      </div>

      {/* ── Fixed Bottom Action Bar ───────────────────────────── */}
      <div className="shrink-0 bg-white border-t border-slate-200
                      shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-2 flex-wrap">

          {/* Result actions — appear once a quote is calculated */}
          {quoteResult && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateQuotePdf}
                loading={quotePdfMutation.isPending}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                Quote PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateIllustration}
                loading={illustrationMutation.isPending}
              >
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                Illustration
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setComparisonOpen(true)}
              >
                <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                Compare
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleEmailToClient}
                loading={emailMutation.isPending}
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                Email Client
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartApplication}
                loading={applyLoading}
                disabled={!quoteReportViewed}
                title={!quoteReportViewed ? 'View the Quote PDF report before applying' : ''}
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                Apply Now
              </Button>
              {!quoteReportViewed && quoteResult && (
                <span className="text-xs text-amber-600 ml-1">View Quote PDF first</span>
              )}
              {applyError && (
                <span className="text-xs text-red-500 ml-2">{applyError}</span>
              )}
            </>
          )}

          {/* Calculate Premium — always on the right */}
          <Button
            type="submit"
            form="quote-form"
            size="md"
            loading={calculateMutation.isPending}
            className="ml-auto"
          >
            <Calculator className="h-[1.125rem] w-[1.125rem]" />
            Calculate Premium
          </Button>

        </div>
      </div>

      {/* ── Comparison Modal ────────────────────────────────────── */}
      <ComparisonModal
        open={comparisonOpen}
        onClose={() => setComparisonOpen(false)}
        products={productsQuery.data}
        currentFormData={getValues()}
      />
    </div>
  );
}
