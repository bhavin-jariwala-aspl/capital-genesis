import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Link2, ChevronRight, Lock } from 'lucide-react';
import Spinner from '../ui/Spinner';
import { runtimeService } from '../../services/metadata.service';
import { fmtDate } from '../../utils/formatters';

/**
 * RelatedPanel — every record that points at this one through a lookup field.
 *
 * Nothing here is per-object: the lists come from the lookup fields admins add
 * in the Builder (`GET /runtime/records/:id/related`). On a Party this is the
 * client 360 — KYC cases, applications, relationships, consents, requests —
 * and on any other object it is that object's children.
 */
export default function RelatedPanel({ recordId }) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ['related', recordId],
    queryFn: () => runtimeService.getRelated(recordId),
    enabled: !!recordId,
  });
  const groups = data?.data ?? [];

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error) return <p className="text-sm text-red-500">Could not load related records.</p>;
  if (!groups.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-white/40 py-6 text-center">
        Nothing links to this record yet. Add a <strong>Lookup</strong> field on another object in the Builder to show it here.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={`${g.object.id}:${g.field.name}`}>
          <header className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              {g.object.plural_label || g.object.label}
              <span className="normal-case tracking-normal font-normal text-gray-400">via {g.field.label}</span>
            </h4>
            <span className="text-xs text-gray-400">{g.total}</span>
          </header>
          {g.restricted > 0 && (
            // Hidden by business-unit scope or an information barrier — say so
            // rather than imply there are none (C360-FR-06).
            <p className="mb-2 ml-5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <Lock className="h-3 w-3" />
              {g.restricted} restricted — contact Compliance
            </p>
          )}
          {g.records.length === 0 ? (
            !g.restricted && <p className="text-xs text-gray-400 pl-5">None</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/5 rounded-xl border border-gray-100 dark:border-white/10">
              {g.records.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/module/${g.object.module_id}/object/${g.object.id}?record=${r.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800 dark:text-white/90">{r.label}</span>
                    {r.stage && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: r.stage.color || '#6b7280' }}>
                        {r.stage.label}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-gray-400 w-24 text-right">{r.created_at ? fmtDate(r.created_at) : ''}</span>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
