import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { analyticsService } from '../services/analytics.service';
import { reportService } from '../services/report.service';

/**
 * Resolve a widget/chart `data_source` descriptor into live data.
 *
 * Supported descriptors:
 *   { type: 'report', report_id, shape?, scope?, global? }
 *       → GET /api/reports/:id/data — a saved report, reshaped for the widget.
 *         `global` ({ date_range, owner }) is a dashboard-wide filter applied at
 *         render time to every report-backed widget at once.
 *         This is the primary mode: anything a business user can build in the
 *         report builder can be placed on a dashboard, with no developer needed.
 *   { type: 'endpoint', dataset: 'premium-revenue-monthly' }
 *       → GET /api/analytics/data/<dataset> — a built-in, pre-computed dataset.
 *   { type: 'endpoint', url: '/insurance/policies', dataPath: 'items' }
 *       → any internal API path, through the axios client (JWT attached).
 *   { type: 'json', data: [...] }
 *       → static payload. Read-only back-compatibility for widgets authored
 *         before report-backed widgets existed; the builder no longer offers it.
 *
 * The external-REST mode (`type: 'api'`, an arbitrary URL with hand-written
 * headers) was removed: it required technical knowledge no business user has, and
 * let a dashboard author point the browser at an arbitrary host.
 *
 * Returns the payload untouched — arrays for series/list widgets, objects for
 * metric widgets — so each consumer normalises for its own shape.
 */

const pick = (obj, path) =>
  path ? path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj) : obj;

/** Static JSON is resolved synchronously; no request is made. */
function resolveStatic(ds) {
  const raw = ds?.data ?? [];
  if (typeof raw !== 'string') return raw;
  return JSON.parse(raw);
}

/**
 * A report-backed widget. The report result carries its own description of which
 * column is the category and which are the measures, returned here as `meta`, so
 * the widget stores no field names at all — editing the report can never leave a
 * dashboard widget pointing at a column that no longer exists.
 */
async function fetchReport(ds) {
  // `ds.global` is a dashboard-level filter ({ date_range, owner }) injected at
  // render time by DashboardRenderer — never stored on the widget.
  const res = await reportService.widgetData(ds.report_id, ds.shape, ds.scope, ds.global);
  const payload = res?.data ?? res;

  if (ds.shape === 'metric') {
    return { data: payload, meta: { ...(res?.meta ?? {}), tiles: payload?.tiles ?? [] } };
  }
  return {
    data: payload?.rows ?? [],
    meta: {
      ...(res?.meta ?? {}),
      xKey: payload?.xKey ?? null,
      xLabel: payload?.xLabel ?? null,
      series: payload?.series ?? [],
      columns: payload?.columns ?? [],
      summary: payload?.summary ?? null,
      comparison: payload?.comparison ?? null,
    },
  };
}

async function fetchInternal(ds) {
  if (ds.dataset) {
    const { data } = await analyticsService.getData(ds.dataset);
    return { data, meta: null };
  }
  const res = await api.get(ds.url);
  return { data: pick(res.data?.data ?? res.data, ds.dataPath), meta: null };
}

export function useDataSource(dataSource, { enabled = true } = {}) {
  const ds = dataSource || null;
  const type = ds?.type ?? 'json';
  const isReport = type === 'report' && !!ds.report_id;
  const isRemote = isReport || (type === 'endpoint' && (ds.dataset || ds.url));

  const query = useQuery({
    // Serialising the descriptor keeps the key stable for inline-built objects
    // (the builder canvas rebuilds `data_source` on every render).
    queryKey: ['widget-data', JSON.stringify(ds ?? null)],
    queryFn: () => (isReport ? fetchReport(ds) : fetchInternal(ds)),
    enabled: enabled && !!isRemote,
    staleTime: 60_000,
  });

  if (!isRemote) {
    try {
      return { data: resolveStatic(ds), meta: null, loading: false, error: null, refetch: () => {} };
    } catch {
      return {
        data: [],
        meta: null,
        loading: false,
        error: 'This widget has no data source yet — pick a report in the Data tab.',
        refetch: () => {},
      };
    }
  }

  return {
    data: query.data?.data,
    meta: query.data?.meta ?? null,
    loading: query.isPending,
    error: query.error ? (query.error.response?.data?.error?.message || query.error.message) : null,
    refetch: query.refetch,
  };
}

/** Series/list widgets need an array — coerce anything else to empty. */
export function useDataSourceRows(dataSource, opts) {
  const { data, ...rest } = useDataSource(dataSource, opts);
  return { data: Array.isArray(data) ? data : [], ...rest };
}

/** Metric widgets need a single object — unwrap `[row]` if an array comes back. */
export function useDataSourceRecord(dataSource, opts) {
  const { data, ...rest } = useDataSource(dataSource, opts);
  const record = Array.isArray(data) ? (data[0] ?? {}) : (data ?? {});
  return { data: record, ...rest };
}

export default useDataSource;
