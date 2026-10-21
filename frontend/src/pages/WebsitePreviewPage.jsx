import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ArrowRight, Calculator, ClipboardList, Globe, Landmark, LineChart as LineIcon, PhoneCall, Newspaper, Code2, Package } from 'lucide-react';
import clsx from 'clsx';
import api from '../services/api';
import Spinner from '../components/ui/Spinner';
import BrandLogo from '../components/ui/BrandLogo';
import { useWorkspaceBranding } from '../hooks/useWorkspaceBranding';
import { useAppearanceStore } from '../store/appearanceStore';
import StaffPreviewBar from '../components/layout/StaffPreviewBar';

/**
 * WebsitePreviewPage — /site/:slug. What a workspace's public website shows
 * when its widgets are fed by the CRM (PRD I-01, I-02): the indicative
 * exchange-rate board, fund NAVs with performance history, the prime lending
 * rate, and the published forms. Every figure comes from the read-only public
 * feeds, so a website can render the same thing with a few lines of script.
 */

const getData = (url) => api.get(url).then((r) => r.data?.data ?? r.data);
const num = (v, d = 2) => (v == null || v === '' ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const day = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function iconFor(title) {
  const t = title.toLowerCase();
  if (t.includes('call')) return PhoneCall;
  if (t.includes('newsletter')) return Newspaper;
  if (t.includes('questionnaire')) return ClipboardList;
  if (t.includes('calculator') || t.includes('estimate')) return Calculator;
  return Globe;
}

function Card({ title, icon: Icon, children, footer, className }) {
  return (
    <section className={clsx('rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-2', className)}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white"><Icon className="h-5 w-5 text-primary-600" />{title}</h2>
      <div className="mt-4">{children}</div>
      {footer && <p className="mt-3 text-xs text-gray-400">{footer}</p>}
    </section>
  );
}

const CATEGORY_LABELS = { lending: 'Financing', wealth: 'Wealth management', funds: 'Investment funds', securities: 'Securities', advisory: 'Corporate advisory', fx: 'Forex' };
const categoryLabel = (c) => CATEGORY_LABELS[c] ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other');

/**
 * The product catalogue from the CRM's product masters. Each product's
 * "Request more information" opens the first published form that offers it
 * (a general web form before a calculator), with `?prod=` pre-selecting it.
 */
function ProductCatalogue({ items, forms }) {
  const live = items.filter((p) => p.active !== false && p.code && p.name);
  const categories = [...new Set(live.map((p) => p.category).filter(Boolean))];
  const [cat, setCat] = useState(null);
  const shown = cat ? live.filter((p) => p.category === cat) : live;
  const formFor = (code) => {
    const offering = forms.filter((f) => (f.products ?? []).some((x) => x.value === code));
    return offering.find((f) => f.channel !== 'calculator') ?? offering[0] ?? null;
  };
  const chip = (active) => clsx('rounded-full px-3 py-1 text-sm font-medium transition',
    active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15');
  return (
    <Card title="Products & services" icon={Package} footer="Rates are indicative: variable, set as a margin over the prime lending rate, and subject to approval.">
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={chip(!cat)} onClick={() => setCat(null)}>All</button>
        {categories.map((c) => <button key={c} type="button" className={chip(cat === c)} onClick={() => setCat(c)}>{categoryLabel(c)}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => {
          const form = formFor(p.code);
          return (
            <article key={p.code} data-product={p.code} className="flex flex-col rounded-xl border border-gray-200 p-4 dark:border-white/10">
              <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-300">{categoryLabel(p.category)}</p>
              <h3 className="mt-1 font-semibold text-gray-900 dark:text-white">{p.name}</h3>
              {p.legal_entity && <p className="text-xs text-gray-500 dark:text-white/50">{p.legal_entity}</p>}
              {p.tagline && <p className="mt-2 text-sm text-gray-600 dark:text-white/70">{p.tagline}</p>}
              {p.rate_from != null && p.rate_from !== '' && (
                <p className="mt-2 text-sm text-gray-900 dark:text-white">Rates from <span className="font-display text-lg font-semibold">{Number(p.rate_from).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}%</span> p.a.</p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-sm">
                {form && (
                  <a href={`${form.path}?prod=${encodeURIComponent(p.code)}`} className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:underline dark:text-primary-300">
                    Request more information<ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
                {p.website_url && <a href={p.website_url} target="_blank" rel="noreferrer" className="text-gray-500 hover:underline dark:text-white/60">Product page</a>}
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

export default function WebsitePreviewPage() {
  const { slug } = useParams();
  const ws = useQuery({ queryKey: ['site', slug, 'forms'], queryFn: () => getData(`/public/workspaces/${slug}/forms`), retry: false });
  const fx = useQuery({ queryKey: ['site', slug, 'fx'], queryFn: () => getData(`/public/feeds/${slug}/fx-rates`) });
  const navs = useQuery({ queryKey: ['site', slug, 'nav'], queryFn: () => getData(`/public/feeds/${slug}/fund-nav`) });
  const hist = useQuery({ queryKey: ['site', slug, 'nav-history'], queryFn: () => getData(`/public/feeds/${slug}/nav-history`) });
  const plr = useQuery({ queryKey: ['site', slug, 'plr'], queryFn: () => getData(`/public/feeds/${slug}/plr`) });
  // The product catalogue, when the workspace publishes one (a `products` feed).
  const products = useQuery({ queryKey: ['site', slug, 'products'], queryFn: () => getData(`/public/feeds/${slug}/products`), retry: false });
  useWorkspaceBranding(ws.data?.tenant_id);
  const appearance = useAppearanceStore((s) => s.current);
  const [selected, setSelected] = useState(null);

  const classes = navs.data?.items ?? [];
  const active = selected ?? classes[0]?.class_code ?? null;
  const series = useMemo(() => (hist.data?.items ?? [])
    .filter((p) => p.class_code === active)
    .map((p) => ({ date: String(p.nav_date).slice(0, 10), nav: Number(p.nav) })), [hist.data, active]);
  const perf = series.length > 1 ? ((series[series.length - 1].nav / series[0].nav) - 1) * 100 : null;

  if (ws.isError) return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">This website preview is not available.</div>;
  if (ws.isLoading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  const name = ws.data?.workspace ?? 'Website';
  const rate = plr.data?.items?.[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-1">
      <header className="bg-gradient-to-br from-primary-700 via-mid-600 to-accent-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" onDark appearance={appearance} showName={false} />
            <span className="font-display text-xl font-semibold">{name}</span>
          </div>
          <h1 className="mt-8 max-w-2xl font-display text-3xl font-semibold leading-tight sm:text-4xl">Investment, financing, advisory and forex — in one place.</h1>
          <p className="mt-3 max-w-2xl text-white/80">Live rates and fund prices below come straight from the CRM.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {(ws.data?.forms ?? []).slice(0, 3).map((f) => (
              <a key={f.path} href={f.path} className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25">
                {f.title}<ArrowRight className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Indicative exchange rates" icon={Globe} className="lg:col-span-2"
            footer={fx.data?.items?.[0]?.rate_date ? `MUR per unit, as at ${day(fx.data.items[0].rate_date)}. Indicative only.` : null}>
            {fx.isLoading ? <Spinner /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400"><th className="py-1.5 pr-4 font-medium">Currency</th><th className="py-1.5 pr-4 text-right font-medium">We buy</th><th className="py-1.5 pr-4 text-right font-medium">We sell</th><th className="py-1.5 text-right font-medium">Mid</th></tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {/* The base currency against itself (1.0000) is not a rate. */}
                    {(fx.data?.items ?? []).filter((r) => Number(r.rate_to_mur) !== 1 || r.currency_code !== 'MUR').map((r) => (
                      <tr key={r.currency_code}>
                        <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-white">{r.currency_code}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{num(r.buy_tt, 4)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{num(r.sell_tt, 4)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{num(r.rate_to_mur, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Prime lending rate" icon={Landmark} footer={rate ? `Effective ${day(rate.effective_from)}. Loan rates are set as a margin over this rate.` : null}>
            {plr.isLoading ? <Spinner /> : <p className="font-display text-5xl font-semibold text-gray-900 dark:text-white">{rate ? `${num(rate.rate, 3)}%` : '—'}</p>}
          </Card>
        </div>

        <Card title="Fund prices (NAV)" icon={LineIcon} footer="Past performance is not a guide to future returns. Prices are per unit in the share-class currency.">
          {navs.isLoading ? <Spinner /> : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="overflow-x-auto lg:col-span-3">
                <table className="min-w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400"><th className="py-1.5 pr-4 font-medium">Fund</th><th className="py-1.5 pr-4 text-right font-medium">NAV</th><th className="py-1.5 pr-4 font-medium">Date</th><th className="py-1.5 text-right font-medium">Risk</th></tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                    {classes.map((c) => (
                      <tr key={c.class_code} onClick={() => setSelected(c.class_code)}
                        className={clsx('cursor-pointer', c.class_code === active ? 'bg-primary-50/70 dark:bg-primary-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5')}>
                        <td className="py-2 pr-4"><span className="font-medium text-gray-900 dark:text-white">{c.name}</span></td>
                        <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">{c.currency_code} {num(c.latest_nav, 4)}</td>
                        <td className="whitespace-nowrap py-2 pr-4 text-gray-500">{day(c.latest_nav_date)}</td>
                        <td className="py-2 text-right">{c.risk_rating ?? '—'}/5</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lg:col-span-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{classes.find((c) => c.class_code === active)?.name ?? 'Performance'}</p>
                <p className="text-xs text-gray-500">{perf == null ? 'Performance history' : `${perf >= 0 ? '+' : ''}${perf.toFixed(2)}% over the period shown`}</p>
                <div className="mt-2 h-56">
                  {series.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgb(var(--n-200))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={56} />
                        <Tooltip formatter={(v) => num(v, 4)} />
                        <Line type="monotone" dataKey="nav" stroke="rgb(var(--pc-500))" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <p className="py-16 text-center text-sm text-gray-400">No history yet for this fund.</p>}
                </div>
              </div>
            </div>
          )}
        </Card>

        {(products.data?.items ?? []).length > 0 && (
          <ProductCatalogue items={products.data.items} forms={ws.data?.forms ?? []} />
        )}

        <Card title="Get started online" icon={ArrowRight}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(ws.data?.forms ?? []).map((f) => {
              const Icon = iconFor(f.title);
              return (
                <a key={f.path} href={f.path} className="group flex items-start gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-primary-300 hover:bg-primary-50/40 dark:border-white/10 dark:hover:bg-white/5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-medium text-gray-900 dark:text-white">{f.title}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" /></span>
                    {f.description && <span className="mt-0.5 block text-sm text-gray-500 dark:text-white/60">{f.description}</span>}
                  </span>
                </a>
              );
            })}
          </div>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Code2 className="h-3.5 w-3.5" /> Website feeds: <code className="rounded bg-gray-100 px-1 dark:bg-white/10">/api/public/feeds/{slug}/fx-rates · fund-nav · nav-history · plr</code>
        </p>
      </main>
      <StaffPreviewBar pageKey="site" slug={slug} />
    </div>
  );
}
