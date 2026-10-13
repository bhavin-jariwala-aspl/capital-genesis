import { useState, useMemo, useRef, useCallback, createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, Network, Search, X, ChevronDown, ChevronRight,
  ChevronsDownUp, ChevronsUpDown, ZoomIn, ZoomOut, Maximize2,
  LayoutGrid, List as ListIcon, Filter, Mail, Phone, Building2,
  MapPin, Crosshair, ArrowLeft, Layers, GitBranch, Gauge, UserRound,
} from 'lucide-react';
import clsx from 'clsx';
import { authService } from '../../services/auth.service';
import Spinner from '../../components/ui/Spinner';
import BuilderGuide from '../../components/builder/BuilderGuide';

/* ────────────────────────────────────────────────────────────────────────
 * Color palette — literal Tailwind class strings (so the JIT compiler keeps
 * them). Nodes are tinted by role level / region / branch so an admin can
 * read the shape of the org at a glance.
 * ──────────────────────────────────────────────────────────────────────── */
const PALETTE = [
  { avatar: 'from-primary-500 to-mid-600',  bar: 'bg-primary-500',  chip: 'bg-primary-500/15 text-primary-600 dark:text-primary-300',   ring: 'ring-primary-500' },
  { avatar: 'from-sky-500 to-cyan-600',       bar: 'bg-sky-500',     chip: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',           ring: 'ring-sky-500' },
  { avatar: 'from-emerald-500 to-teal-600',   bar: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', ring: 'ring-emerald-500' },
  { avatar: 'from-amber-500 to-orange-600',   bar: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',      ring: 'ring-amber-500' },
  { avatar: 'from-rose-500 to-pink-600',      bar: 'bg-rose-500',    chip: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',         ring: 'ring-rose-500' },
  { avatar: 'from-violet-500 to-purple-600',  bar: 'bg-violet-500',  chip: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',   ring: 'ring-violet-500' },
  { avatar: 'from-cyan-500 to-blue-600',      bar: 'bg-cyan-500',    chip: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',         ring: 'ring-cyan-500' },
  { avatar: 'from-accent-500 to-pink-600',   bar: 'bg-accent-500', chip: 'bg-accent-500/15 text-accent-600 dark:text-accent-300', ring: 'ring-accent-500' },
];
const LINE = 'bg-gray-300 dark:bg-white/15';

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
const pretty = (s) => (s || '').replaceAll('_', ' ');

const OrgCtx = createContext(null);

/* ════════════════════════════════════════════════════════════════════════
 * Page
 * ════════════════════════════════════════════════════════════════════════ */
export default function OrgChartPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-hierarchy'],
    queryFn: authService.getOrgHierarchy,
  });
  const graph = useMemo(() => data?.data ?? data ?? {}, [data]);

  // ── View state ──────────────────────────────────────────────────────────
  const [viewMode, setViewMode]     = useState('chart');   // 'chart' | 'tree'
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | inactive
  const [colorBy, setColorBy]       = useState('role');     // role | region | branch
  const [collapsed, setCollapsed]   = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId]       = useState(null);
  const [zoom, setZoom]             = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const scrollRef  = useRef(null);
  const contentRef = useRef(null);
  const pan        = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  // ── Build the forest ─────────────────────────────────────────────────────
  const { byId, childrenMap, roots, roleLevel } = useMemo(() => {
    const employees = graph.employees || [];
    const edges     = graph.edges || [];
    const byId = new Map(employees.map((e) => [e.employee_id, e]));
    const childrenMap = new Map();
    const hasParent = new Set();
    for (const { parent_id, child_id } of edges) {
      if (parent_id === child_id) continue;
      if (!byId.has(parent_id) || !byId.has(child_id)) continue;
      if (!childrenMap.has(parent_id)) childrenMap.set(parent_id, []);
      childrenMap.get(parent_id).push(child_id);
      hasParent.add(child_id);
    }
    for (const arr of childrenMap.values()) {
      arr.sort((a, b) => (byId.get(a)?.employee_name || '').localeCompare(byId.get(b)?.employee_name || ''));
    }
    const roots = employees
      .filter((e) => !hasParent.has(e.employee_id))
      .map((e) => e.employee_id)
      .sort((a, b) => (byId.get(a)?.employee_name || '').localeCompare(byId.get(b)?.employee_name || ''));
    const roleLevel = new Map((graph.roles || []).map((r) => [r.name, r.level]));
    return { byId, childrenMap, roots, roleLevel };
  }, [graph]);

  // ── Depth / descendant counts / parent map (single DFS over the forest) ──
  const meta = useMemo(() => {
    const depth = new Map(), desc = new Map(), parent = new Map();
    const visited = new Set();
    const dfs = (id, d, par) => {
      if (visited.has(id)) return 0;
      visited.add(id);
      depth.set(id, d);
      if (par) parent.set(id, par);
      let count = 0;
      for (const k of (childrenMap.get(id) || [])) count += 1 + dfs(k, d + 1, id);
      desc.set(id, count);
      return count;
    };
    for (const r of roots) dfs(r, 0, null);
    for (const id of byId.keys()) if (!visited.has(id)) dfs(id, 0, null); // safety net
    return { depth, desc, parent };
  }, [byId, childrenMap, roots]);

  // ── Filter options ───────────────────────────────────────────────────────
  const options = useMemo(() => {
    const employees = graph.employees || [];
    const branches = new Map(), regions = new Map();
    for (const e of employees) {
      if (e.branch) branches.set(String(e.branch.branch_id), e.branch.branch_name);
      if (e.region) regions.set(String(e.region.region_id), e.region.region_name);
    }
    return {
      roles: graph.roles || [],
      branches: [...branches.entries()],
      regions: [...regions.entries()],
    };
  }, [graph]);

  const anyFilter = !!(search.trim() || filterRole || filterBranch || filterRegion || filterStatus !== 'all');

  const matches = useCallback((emp) => {
    if (!emp) return false;
    if (filterStatus === 'active' && !emp.is_active) return false;
    if (filterStatus === 'inactive' && emp.is_active) return false;
    if (filterRole && emp.role !== filterRole) return false;
    if (filterBranch && String(emp.branch?.branch_id) !== filterBranch) return false;
    if (filterRegion && String(emp.region?.region_id) !== filterRegion) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${emp.employee_name} ${emp.employee_id} ${pretty(emp.role)} ${emp.email || ''} ${emp.branch?.branch_name || ''} ${emp.region?.region_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [filterStatus, filterRole, filterBranch, filterRegion, search]);

  // ── Relevance: a node is shown if it or any descendant matches ───────────
  const relevant = useMemo(() => {
    const rel = new Map();
    const visited = new Set();
    const dfs = (id) => {
      if (visited.has(id)) return rel.get(id) || false;
      visited.add(id);
      let r = matches(byId.get(id));
      for (const k of (childrenMap.get(id) || [])) { if (dfs(k)) r = true; }
      rel.set(id, r);
      return r;
    };
    for (const id of byId.keys()) dfs(id);
    return rel;
  }, [byId, childrenMap, matches]);

  // ── Stats bar ────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const employees = graph.employees || [];
    const spanValues = [...childrenMap.values()].map((a) => a.length).filter((n) => n > 0);
    const avgSpan = spanValues.length ? spanValues.reduce((a, b) => a + b, 0) / spanValues.length : 0;
    const maxDepth = meta.depth.size ? Math.max(...meta.depth.values()) : 0;
    return {
      total:    employees.length,
      active:   employees.filter((e) => e.is_active).length,
      managers: spanValues.length,
      levels:   maxDepth + (employees.length ? 1 : 0),
      avgSpan,
      topLevel: roots.length,
    };
  }, [graph, childrenMap, meta, roots]);

  const colorFor = useCallback((emp) => {
    let key;
    if (colorBy === 'region')      key = emp?.region ? `r${emp.region.region_id}` : 'none';
    else if (colorBy === 'branch') key = emp?.branch ? `b${emp.branch.branch_id}` : 'none';
    else {
      const lvl = roleLevel.get(emp?.role);
      key = lvl != null ? `l${lvl}` : (emp?.role || 'none');
    }
    return PALETTE[hashStr(key) % PALETTE.length];
  }, [colorBy, roleLevel]);

  // ── Interaction helpers ──────────────────────────────────────────────────
  const toggleCollapse = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const isCollapsed = useCallback((id) => !anyFilter && collapsed.has(id), [anyFilter, collapsed]);

  const managerIds = useMemo(
    () => [...childrenMap.entries()].filter(([, k]) => k.length).map(([id]) => id),
    [childrenMap],
  );
  const collapseAll = () => setCollapsed(new Set(managerIds));
  const expandAll   = () => setCollapsed(new Set());

  const visibleChildren = useCallback(
    (id) => {
      const kids = childrenMap.get(id) || [];
      return anyFilter ? kids.filter((k) => relevant.get(k)) : kids;
    },
    [childrenMap, anyFilter, relevant],
  );

  const rootIds = useMemo(() => {
    const base = focusId && byId.has(focusId) ? [focusId] : roots;
    return anyFilter ? base.filter((id) => relevant.get(id)) : base;
  }, [focusId, byId, roots, anyFilter, relevant]);

  // ── Zoom / pan ───────────────────────────────────────────────────────────
  const clampZoom = (z) => Math.min(1.6, Math.max(0.4, Math.round(z * 10) / 10));
  const fitToScreen = () => {
    const c = scrollRef.current, inner = contentRef.current;
    if (!c || !inner) return;
    const cw = c.clientWidth - 64;
    const iw = inner.scrollWidth / zoom;
    setZoom(clampZoom(Math.min(1, cw / iw)));
    c.scrollTo({ top: 0, left: (c.scrollWidth - c.clientWidth) / 2 });
  };
  const onPanStart = (e) => {
    if (e.button !== 0 || e.target.closest('[data-nopan]')) return;
    const c = scrollRef.current;
    pan.current = { active: true, x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop };
  };
  const onPanMove = (e) => {
    if (!pan.current.active) return;
    const c = scrollRef.current;
    c.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    c.scrollTop  = pan.current.top  - (e.clientY - pan.current.y);
  };
  const onPanEnd = () => { pan.current.active = false; };

  const selected = selectedId ? byId.get(selectedId) : null;

  // ── Loading / error ──────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  }
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-gray-500 dark:text-white/60">Could not load the organization hierarchy.</p>
        <button onClick={() => refetch()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-700">Retry</button>
      </div>
    );
  }

  const ctx = {
    byId, childrenMap, meta, colorFor, selectedId, setSelectedId,
    isCollapsed, toggleCollapse, visibleChildren, matches, anyFilter,
    setFocusId,
  };

  return (
    <OrgCtx.Provider value={ctx}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-mid-600 text-on-primary">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Organization Chart</h1>
              <p className="text-xs text-gray-500 dark:text-white/50">Interactive hierarchy of every member in the system</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-white/10">
              <ToggleBtn active={viewMode === 'chart'} onClick={() => setViewMode('chart')} icon={LayoutGrid} label="Chart" />
              <ToggleBtn active={viewMode === 'tree'}  onClick={() => setViewMode('tree')}  icon={ListIcon}   label="Tree" />
            </div>
          </div>
        </div>

        <div className="px-6 pt-4">
          <BuilderGuide section="/builder/org-chart" />
        </div>

        {/* ── Stats strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-100 sm:grid-cols-3 lg:grid-cols-6 dark:border-white/10 dark:bg-white/5">
          <Stat icon={Users}     label="Members"        value={summary.total} sub={`${summary.active} active`} />
          <Stat icon={UserRound} label="Managers"       value={summary.managers} />
          <Stat icon={Layers}    label="Levels"         value={summary.levels} />
          <Stat icon={GitBranch} label="Top-level"      value={summary.topLevel} sub="no manager" />
          <Stat icon={Gauge}     label="Avg. span"      value={summary.avgSpan.toFixed(1)} sub="reports/mgr" />
          <Stat icon={Network}   label="Coloured by"    value={pretty(colorBy)} isText />
        </div>

        {/* ── Toolbar ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-6 py-3 dark:border-white/10">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, role, email…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFilters((s) => !s)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium',
              showFilters || (anyFilter && !search)
                ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5',
            )}
          >
            <Filter className="h-4 w-4" /> Filters
          </button>

          <select value={colorBy} onChange={(e) => setColorBy(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            <option value="role">Colour by role</option>
            <option value="region">Colour by region</option>
            <option value="branch">Colour by branch</option>
          </select>

          <div className="flex-1" />

          <button onClick={collapseAll} title="Collapse all" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
            <ChevronsDownUp className="h-4 w-4" /> <span className="hidden sm:inline">Collapse</span>
          </button>
          <button onClick={expandAll} title="Expand all" className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5">
            <ChevronsUpDown className="h-4 w-4" /> <span className="hidden sm:inline">Expand</span>
          </button>

          {viewMode === 'chart' && (
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-white/10">
              <IconBtn onClick={() => setZoom((z) => clampZoom(z - 0.1))} title="Zoom out"><ZoomOut className="h-4 w-4" /></IconBtn>
              <span className="w-12 select-none text-center text-xs font-medium text-gray-500 dark:text-white/60">{Math.round(zoom * 100)}%</span>
              <IconBtn onClick={() => setZoom((z) => clampZoom(z + 0.1))} title="Zoom in"><ZoomIn className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={fitToScreen} title="Fit to screen"><Maximize2 className="h-4 w-4" /></IconBtn>
            </div>
          )}
        </div>

        {/* ── Filter panel ───────────────────────────────────────────────── */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <FilterSelect label="Role" value={filterRole} onChange={setFilterRole}
              options={[['', 'All roles'], ...options.roles.map((r) => [r.name, r.label])]} />
            <FilterSelect label="Region" value={filterRegion} onChange={setFilterRegion}
              options={[['', 'All regions'], ...options.regions]} />
            <FilterSelect label="Branch" value={filterBranch} onChange={setFilterBranch}
              options={[['', 'All branches'], ...options.branches]} />
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}
              options={[['all', 'All'], ['active', 'Active only'], ['inactive', 'Inactive only']]} />
            {anyFilter && (
              <button
                onClick={() => { setFilterRole(''); setFilterRegion(''); setFilterBranch(''); setFilterStatus('all'); setSearch(''); }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* ── Focus banner ───────────────────────────────────────────────── */}
        {focusId && byId.has(focusId) && (
          <div className="flex items-center gap-2 border-b border-primary-200 bg-primary-50 px-6 py-2 text-sm dark:border-primary-500/30 dark:bg-primary-500/10">
            <Crosshair className="h-4 w-4 text-primary-500" />
            <span className="text-primary-700 dark:text-primary-200">
              Focused on <strong>{byId.get(focusId)?.employee_name}</strong>&rsquo;s team
            </span>
            <button onClick={() => setFocusId(null)} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-500/20">
              <ArrowLeft className="h-3.5 w-3.5" /> Show full org
            </button>
          </div>
        )}

        {/* ── Canvas + detail drawer ─────────────────────────────────────── */}
        <div className="relative flex flex-1 overflow-hidden">
          {viewMode === 'chart' ? (
            <div
              ref={scrollRef}
              onMouseDown={onPanStart}
              onMouseMove={onPanMove}
              onMouseUp={onPanEnd}
              onMouseLeave={onPanEnd}
              className="flex-1 cursor-grab overflow-auto bg-gray-50 bg-[radial-gradient(circle,rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:22px_22px] active:cursor-grabbing dark:bg-[#0d1117] dark:bg-[radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)]"
            >
              {rootIds.length === 0 ? (
                <EmptyState anyFilter={anyFilter} />
              ) : (
                <div
                  ref={contentRef}
                  className="flex min-w-max items-start justify-center gap-12 p-16"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                >
                  {rootIds.map((id) => <ChartNode key={id} id={id} />)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-white p-4 dark:bg-transparent">
              {rootIds.length === 0 ? (
                <EmptyState anyFilter={anyFilter} />
              ) : (
                <div className="mx-auto max-w-3xl">
                  {rootIds.map((id) => <TreeRow key={id} id={id} depth={0} />)}
                </div>
              )}
            </div>
          )}

          {/* Detail drawer */}
          {selected && (
            <DetailDrawer
              emp={selected}
              ctx={ctx}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
              onFocus={(id) => { setFocusId(id); setSelectedId(id); }}
            />
          )}
        </div>
      </div>
    </OrgCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Org-chart node (recursive, top-down with CSS connectors)
 * ════════════════════════════════════════════════════════════════════════ */
function ChartNode({ id }) {
  const ctx = useContext(OrgCtx);
  const { byId, meta, visibleChildren, isCollapsed } = ctx;
  const emp = byId.get(id);
  if (!emp) return null;

  const kids = visibleChildren(id);
  const collapsed = isCollapsed(id);
  const showKids = kids.length > 0 && !collapsed;

  return (
    <div className="flex flex-col items-center">
      <NodeCard id={id} directReports={(ctx.childrenMap.get(id) || []).length} descendants={meta.desc.get(id) || 0} />

      {showKids && (
        <>
          <div className={clsx('h-8 w-px', LINE)} />
          <div className="flex items-start">
            {kids.map((kid, i) => {
              const pos = kids.length === 1 ? 'only' : i === 0 ? 'first' : i === kids.length - 1 ? 'last' : 'mid';
              return (
                <div key={kid} className="relative flex flex-col items-center px-3">
                  {pos !== 'only' && (
                    <div className={clsx(
                      'absolute top-0 h-px',
                      LINE,
                      pos === 'first' && 'left-1/2 right-0',
                      pos === 'last'  && 'left-0 right-1/2',
                      pos === 'mid'   && 'left-0 right-0',
                    )} />
                  )}
                  <div className={clsx('h-8 w-px', LINE)} />
                  <ChartNode id={kid} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function NodeCard({ id, directReports, descendants }) {
  const { byId, colorFor, selectedId, setSelectedId, isCollapsed, toggleCollapse, matches, anyFilter } = useContext(OrgCtx);
  const emp = byId.get(id);
  const color = colorFor(emp);
  const selected = selectedId === id;
  const collapsed = isCollapsed(id);
  const isMatch = anyFilter && matches(emp);
  const dimmed = anyFilter && !matches(emp);

  return (
    <div
      data-nopan
      onClick={() => setSelectedId(id)}
      className={clsx(
        'group relative w-56 cursor-pointer rounded-xl border bg-white shadow-sm transition dark:bg-[#161b22]',
        selected
          ? 'border-transparent ring-2 ' + color.ring
          : isMatch
            ? 'border-amber-400 dark:border-amber-400/60'
            : 'border-gray-200 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:hover:border-white/20',
        dimmed && 'opacity-40',
      )}
    >
      <div className={clsx('h-1 w-full rounded-t-xl', color.bar)} />
      <div className="flex items-start gap-3 p-3">
        <div className={clsx('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white', color.avatar)}>
          {initials(emp.employee_name)}
          <span className={clsx(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#161b22]',
            emp.is_active ? 'bg-emerald-500' : 'bg-gray-400',
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{emp.employee_name}</p>
          <span className={clsx('mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize', color.chip)}>
            {pretty(emp.role)}
          </span>
          <div className="mt-1.5 space-y-0.5">
            {emp.branch && (
              <p className="flex items-center gap-1 truncate text-[11px] text-gray-500 dark:text-white/50">
                <Building2 className="h-3 w-3 shrink-0" /> {emp.branch.branch_name}
              </p>
            )}
            {emp.region && (
              <p className="flex items-center gap-1 truncate text-[11px] text-gray-500 dark:text-white/50">
                <MapPin className="h-3 w-3 shrink-0" /> {emp.region.region_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {directReports > 0 && (
        <button
          data-nopan
          onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
          title={collapsed ? 'Expand team' : 'Collapse team'}
          className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 shadow-sm hover:border-primary-400 hover:text-primary-600 dark:border-white/15 dark:bg-[#161b22] dark:text-white/70 dark:hover:text-primary-300"
        >
          {collapsed
            ? <><ChevronRight className="h-3 w-3" />{descendants}</>
            : <><ChevronDown className="h-3 w-3" />{directReports}</>}
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Tree / list view (recursive)
 * ════════════════════════════════════════════════════════════════════════ */
function TreeRow({ id, depth }) {
  const ctx = useContext(OrgCtx);
  const { byId, colorFor, selectedId, setSelectedId, meta, visibleChildren, isCollapsed, toggleCollapse, matches, anyFilter, childrenMap } = ctx;
  const emp = byId.get(id);
  if (!emp) return null;
  const kids = visibleChildren(id);
  const hasKids = (childrenMap.get(id) || []).length > 0;
  const open = !isCollapsed(id);
  const color = colorFor(emp);
  const selected = selectedId === id;
  const dimmed = anyFilter && !matches(emp);

  return (
    <div>
      <div
        onClick={() => setSelectedId(id)}
        style={{ paddingLeft: depth * 22 + 8 }}
        className={clsx(
          'group flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-3 transition',
          selected ? 'bg-primary-50 dark:bg-primary-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5',
          dimmed && 'opacity-40',
        )}
      >
        {hasKids ? (
          <button onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }} className="rounded p-0.5 hover:bg-gray-200 dark:hover:bg-white/10">
            {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
        ) : <span className="w-5" />}
        <div className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white', color.avatar)}>
          {initials(emp.employee_name)}
        </div>
        <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{emp.employee_name}</span>
        <span className={clsx('rounded px-1.5 py-0.5 text-[10px] font-medium capitalize', color.chip)}>{pretty(emp.role)}</span>
        {!emp.is_active && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/10 dark:text-white/50">inactive</span>}
        {hasKids && <span className="ml-auto text-xs text-gray-400">{meta.desc.get(id)} reports</span>}
      </div>
      {open && kids.map((kid) => <TreeRow key={kid} id={kid} depth={depth + 1} />)}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Detail drawer
 * ════════════════════════════════════════════════════════════════════════ */
function DetailDrawer({ emp, ctx, onClose, onSelect, onFocus }) {
  const { byId, childrenMap, meta, colorFor } = ctx;
  const color = colorFor(emp);
  const id = emp.employee_id;

  // Manager chain (root → … → this)
  const chain = [];
  let cur = meta.parent.get(id);
  const guard = new Set();
  while (cur && !guard.has(cur)) { guard.add(cur); chain.unshift(cur); cur = meta.parent.get(cur); }

  const reports = childrenMap.get(id) || [];

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#161b22]">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Member details</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity */}
        <div className="flex flex-col items-center gap-2 border-b border-gray-200 px-4 py-5 text-center dark:border-white/10">
          <div className={clsx('flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-xl font-semibold text-white', color.avatar)}>
            {initials(emp.employee_name)}
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-white">{emp.employee_name}</p>
            <span className={clsx('mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium capitalize', color.chip)}>{pretty(emp.role)}</span>
          </div>
          <span className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            emp.is_active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-white/50',
          )}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', emp.is_active ? 'bg-emerald-500' : 'bg-gray-400')} />
            {emp.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-px border-b border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-white/5">
          <Metric label="Direct" value={reports.length} />
          <Metric label="Team" value={meta.desc.get(id) || 0} />
          <Metric label="Level" value={(meta.depth.get(id) || 0) + 1} />
        </div>

        {/* Contact / placement */}
        <div className="space-y-2.5 border-b border-gray-200 px-4 py-4 text-sm dark:border-white/10">
          <Row icon={UserRound} label="Employee ID" value={emp.employee_id} />
          {emp.email && <Row icon={Mail} label="Email" value={emp.email} />}
          {emp.phone && <Row icon={Phone} label="Phone" value={emp.phone} />}
          {emp.branch && <Row icon={Building2} label="Branch" value={emp.branch.branch_name} />}
          {emp.region && <Row icon={MapPin} label="Region" value={emp.region.region_name} />}
        </div>

        {/* Reporting line */}
        {chain.length > 0 && (
          <div className="border-b border-gray-200 px-4 py-4 dark:border-white/10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Reporting line</p>
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {chain.map((cid) => (
                <span key={cid} className="flex items-center gap-1">
                  <button onClick={() => onSelect(cid)} className="rounded px-1.5 py-0.5 font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10">
                    {byId.get(cid)?.employee_name}
                  </button>
                  <ChevronRight className="h-3 w-3 text-gray-300 dark:text-white/30" />
                </span>
              ))}
              <span className="rounded px-1.5 py-0.5 font-semibold text-gray-900 dark:text-white">{emp.employee_name}</span>
            </div>
          </div>
        )}

        {/* Direct reports */}
        {reports.length > 0 && (
          <div className="px-4 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Direct reports ({reports.length})</p>
            <div className="space-y-1">
              {reports.map((rid) => {
                const r = byId.get(rid);
                if (!r) return null;
                const rc = colorFor(r);
                return (
                  <button key={rid} onClick={() => onSelect(rid)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5">
                    <div className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white', rc.avatar)}>
                      {initials(r.employee_name)}
                    </div>
                    <span className="truncate text-sm text-gray-800 dark:text-white/80">{r.employee_name}</span>
                    <span className="ml-auto text-[11px] capitalize text-gray-400">{pretty(r.role)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-gray-200 px-4 py-3 dark:border-white/10">
        <button
          onClick={() => onFocus(id)}
          disabled={reports.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-on-primary hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Crosshair className="h-4 w-4" /> Focus team
        </button>
        <Link
          to="/builder/employees"
          className="flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
        >
          Edit
        </Link>
      </div>
    </aside>
  );
}

/* ────────────────────────────── Small pieces ──────────────────────────── */
function ToggleBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
        active ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:text-white/60 dark:hover:bg-white/10',
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
function IconBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white">
      {children}
    </button>
  );
}
function Stat({ icon: Icon, label, value, sub, isText }) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-[#0d1117]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-500 dark:bg-primary-500/10 dark:text-primary-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className={clsx('font-semibold text-gray-900 dark:text-white', isText ? 'text-sm capitalize' : 'text-lg leading-tight')}>{value}</p>
        <p className="truncate text-[11px] text-gray-500 dark:text-white/50">{label}{sub ? ` · ${sub}` : ''}</p>
      </div>
    </div>
  );
}
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-gray-500 dark:text-white/50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[150px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white/80"
      >
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </label>
  );
}
function Metric({ label, value }) {
  return (
    <div className="bg-white px-2 py-3 text-center dark:bg-[#161b22]">
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-gray-500 dark:text-white/50">{label}</p>
    </div>
  );
}
function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className="break-words text-sm text-gray-800 dark:text-white/80">{value}</p>
      </div>
    </div>
  );
}
function EmptyState({ anyFilter }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/5">
        <Users className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-gray-600 dark:text-white/60">
        {anyFilter ? 'No members match your filters' : 'No members to display'}
      </p>
      <p className="text-xs text-gray-400">
        {anyFilter ? 'Try clearing the search or filters.' : 'Add employees to see the organization chart.'}
      </p>
    </div>
  );
}
