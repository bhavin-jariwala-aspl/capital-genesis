import { useQuery } from '@tanstack/react-query';
import { Lock, Users, UserCheck, Globe, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import { builderService } from '../../services/builder.service';

const ICONS = { private: Lock, team: Users, shared: UserCheck, everyone: Globe };

/**
 * ShareSettings — who can see this report, in the words a business user uses.
 *
 * Deliberately not an ACL editor: four choices, each with a one-line consequence
 * spelled out, plus a role picker that only appears for "Specific roles". Editing
 * always stays with the author (and administrators), so sharing a report can
 * never mean losing control of it.
 */
export default function ShareSettings({ visibility, sharedWith = [], folderId, folders = [], visibilities = [], onChange }) {
  const { data: rolesData } = useQuery({
    queryKey: ['builder-roles'],
    queryFn: builderService.getRoles,
    staleTime: Infinity,
    enabled: visibility === 'shared',
  });
  const roles = rolesData?.data ?? [];

  const toggleRole = (name) =>
    onChange({
      shared_with: sharedWith.includes(name)
        ? sharedWith.filter((r) => r !== name)
        : [...sharedWith, name],
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {visibilities.map((v) => {
          const Icon = ICONS[v.key] ?? Lock;
          const active = visibility === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => onChange({ visibility: v.key, shared_with: v.key === 'shared' ? sharedWith : [] })}
              className={clsx(
                'flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition',
                active
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5',
              )}
            >
              <span
                className={clsx(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                  active ? 'bg-primary-600 text-on-primary' : 'bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-white/40',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className={clsx('block text-sm font-medium', active ? 'text-primary-700 dark:text-primary-200' : 'text-gray-800 dark:text-white/80')}>
                  {v.label}
                </span>
                <span className="block text-[11px] leading-relaxed text-gray-500 dark:text-white/45">{v.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {visibility === 'shared' && (
        <div className="rounded-xl border border-gray-200 p-2.5 dark:border-white/10">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Roles that can view</p>
          <div className="flex flex-wrap gap-1.5">
            {roles.length === 0 && <span className="text-xs text-gray-400">Loading roles…</span>}
            {roles.map((r) => {
              const on = sharedWith.includes(r.name);
              return (
                <button
                  key={r.name}
                  type="button"
                  onClick={() => toggleRole(r.name)}
                  className={clsx(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                    on
                      ? 'bg-primary-600 text-on-primary'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/10 dark:text-white/50',
                  )}
                >
                  {r.label || r.name}
                </button>
              );
            })}
          </div>
          {sharedWith.length === 0 && (
            <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
              Pick at least one role, or nobody else will see this report.
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="report-folder" className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <FolderOpen className="h-3 w-3" /> Folder
        </label>
        <select
          id="report-folder"
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          value={folderId ?? ''}
          onChange={(e) => onChange({ folder_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Uncategorised</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      <p className="text-[10px] leading-relaxed text-gray-400">
        Sharing controls who can <em>view</em> this report. Only you and administrators can change or delete it —
        anyone else can make their own copy.
      </p>
    </div>
  );
}
