import { useMemo } from 'react';
import clsx from 'clsx';
import {
  Mail, Phone, Building2, MapPin, Globe, Hash,
  User,
} from 'lucide-react';
import Badge from '../ui/Badge';
import StatusTracker from '../ui/StatusTracker';
import FieldValue, { hasValue } from './FieldValue';
import { statusVariant, optionLabel } from '../../utils/metadata-helpers';
import { recordTitle, initials, gradientFor } from '../../utils/record';

/**
 * ClientDetails — the "filled-in" 360° header for a record.
 *
 * Renders a colourful hero (avatar + title + stage + key contact chips),
 * any `status_tracker` fields as full timelines, and a grouped grid of every
 * populated field. Status / select values are shown as coloured badges so the
 * whole picture reads at a glance.
 *
 * Props:
 *   record  — { id, data, pipeline_stage } runtime record
 *   fields  — object field metadata (UiField[]): { name, label, field_type, options, config, order_index }
 *   object  — the active UiObject ({ name, label })
 */

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const ft = (f) => f.field_type ?? f.type;

/** Fields that are structural or rendered elsewhere — skip them in the grid. */
const SKIP_TYPES = new Set(['hidden', 'image', 'file', 'divider', 'status_tracker', 'password']);
const SKIP_NAMES = new Set(['full_name', 'id', 'tenant_id', 'created_at', 'updated_at']);


/* ─── Component ──────────────────────────────────────────────────────────── */

export default function ClientDetails({ record, fields = [], object, stage: stageProp }) {
  const data = useMemo(() => record?.data ?? {}, [record]);
  const title = recordTitle(data) || `Record #${record?.id}`;
  const stage = stageProp ?? record?.pipeline_stage;

  // Sort fields by their configured order for a stable, form-like layout.
  const sorted = useMemo(
    () => [...fields].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [fields],
  );

  // Status-tracker fields are rendered as full colourful timelines.
  const trackerFields = useMemo(() => sorted.filter((f) => ft(f) === 'status_tracker'), [sorted]);

  // Hero status fallback: when the record has no pipeline stage assigned, surface
  // its `status` field (with option colour) so the header always conveys standing.
  const statusField = useMemo(
    () => (stage?.label ? null : sorted.find((f) => f.name === 'status' && (f.options?.length))),
    [sorted, stage],
  );
  const statusValue = statusField ? data[statusField.name] : null;

  // Contact quick-chips derived from common field names.
  const chips = useMemo(() => [
    { icon: Mail, value: data.email || data.contact_email, href: (v) => `mailto:${v}` },
    { icon: Phone, value: data.phone || data.mobile || data.contact_phone, href: (v) => `tel:${v}` },
    { icon: Building2, value: data.company || data.account_name || data.organization },
    { icon: MapPin, value: data.city && data.state ? `${data.city}, ${data.state}` : (data.city || data.state || data.address) },
    { icon: Globe, value: data.website, href: (v) => (v.startsWith('http') ? v : `https://${v}`) },
  ].filter((c) => hasValue(c.value)), [data]);

  // Build display sections. A `heading` field starts a new section; everything
  // before the first heading falls into a default "Details" section.
  const sections = useMemo(() => {
    const out = [{ label: null, fields: [] }];
    for (const f of sorted) {
      const type = ft(f);
      if (type === 'heading') { out.push({ label: f.label, fields: [] }); continue; }
      if (SKIP_TYPES.has(type) || SKIP_NAMES.has(f.name)) continue;
      if (f.is_active === false) continue;
      if (!hasValue(data[f.name])) continue;
      out[out.length - 1].fields.push(f);
    }
    return out.filter((s) => s.fields.length > 0);
  }, [sorted, data]);

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-sm">
        <div className={clsx('absolute inset-x-0 top-0 h-24 bg-gradient-to-r opacity-95', gradientFor(record?.id))} />
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-white/20 blur-2xl pointer-events-none" />
        <div className="relative px-6 pt-9 pb-6">
          <div className="flex items-start gap-4">
            <div className={clsx(
              'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white text-xl font-bold shadow-lg shadow-black/10 ring-4 ring-white dark:ring-night-1',
              gradientFor(record?.id),
            )}>
              {initials(title)}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{title}</h2>
                {stage?.label ? (
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white shadow-sm"
                    style={{ background: stage.color || '#6366f1' }}
                  >
                    {stage.label}
                  </span>
                ) : hasValue(statusValue) && (
                  <Badge variant={statusVariant(statusValue, statusField.options)} dot>
                    {optionLabel(statusValue, statusField.options)}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-white/40 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {object?.label || object?.name}
                {(data.case_number) && (
                  <span className="inline-flex items-center gap-1 ml-1 font-mono text-xs">
                    <Hash className="h-3 w-3" />
                    {data.case_number}
                  </span>
                )}
              </p>

              {/* Contact chips */}
              {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {chips.map((c, i) => {
                    const Icon = c.icon;
                    const content = (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-white/70">
                        <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-white/40" />
                        {c.value}
                      </span>
                    );
                    return c.href
                      ? <a key={i} href={c.href(c.value)} target={c.icon === Globe ? '_blank' : undefined} rel="noreferrer" className="hover:opacity-80">{content}</a>
                      : <span key={i}>{content}</span>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Status trackers ──────────────────────────────────────────────── */}
      {trackerFields.map((f) => (
        <div key={f.name} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
          <StatusTracker recordId={record?.id} config={f.config || {}} label={f.label} />
        </div>
      ))}

      {/* ── Field sections ───────────────────────────────────────────────── */}
      {sections.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-white/30 text-center py-8 rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
          No details have been filled in for this record yet.
        </p>
      ) : (
        sections.map((section, si) => (
          <div key={si} className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-primary-500 to-mid" />
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                {section.label || 'Details'}
              </h3>
              <div className="flex-1 h-px bg-gradient-to-r from-primary-200/60 to-transparent dark:from-primary-500/20" />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
              {section.fields.map((f) => (
                <div key={f.name} className={clsx(ft(f) === 'textarea' || ft(f) === 'rich_text' ? 'sm:col-span-2 xl:col-span-3' : '')}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/30 mb-1">{f.label}</dt>
                  <dd><FieldValue field={f} value={data[f.name]} label={record?.labels?.[f.name]} /></dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </div>
  );
}
