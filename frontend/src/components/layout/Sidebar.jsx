import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Settings, ChevronDown,
  Layers, Database, BarChart2, Workflow, List, Box,
  Wrench, X, Kanban,
  TrendingUp, Users, Building2, LifeBuoy, Megaphone,
  ShoppingCart, Briefcase, Globe, Bell, Star, Zap, Heart,
  FileText, Package, DollarSign, Activity, Mail, Phone,
  Shield, UserCheck, Plug, Crown, Flag, CreditCard,
  Lock, Server, Search, AlertTriangle, Calculator,
  ClipboardCheck, Wallet, FileSignature, FolderOpen, Network, ShieldCheck, FileBarChart, Palette,
  Eye, ChevronRight, Send,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useAppearanceStore } from '../../store/appearanceStore';
import { runtimeService } from '../../services/metadata.service';
import BrandLogo from '../ui/BrandLogo';
import { sidebarSections } from '../../utils/constants';
import { makeIsActive, matchesPath } from '../../utils/navActive';
import { useEntitlements } from '../../hooks/useEntitlements';
import { featureForPath } from '../../utils/featureMap';

const MODULE_ICONS = {
  TrendingUp, Users, Building2, LifeBuoy, Megaphone, Settings,
  ShoppingCart, Briefcase, Globe, Bell, Star, Zap, Heart,
  FileText, Package, DollarSign, Activity, Mail, Phone, Database,
  Shield, AlertTriangle, Calculator, ClipboardCheck, CreditCard, Wallet,
  FileSignature, FolderOpen,
};

const COLOR_CHIP = {
  blue:   { bg: 'bg-blue-100 dark:bg-blue-500/20',     text: 'text-blue-600 dark:text-blue-400' },
  indigo: { bg: 'bg-primary-100 dark:bg-primary-500/20', text: 'text-primary-600 dark:text-primary-400' },
  teal:   { bg: 'bg-teal-100 dark:bg-teal-500/20',     text: 'text-teal-600 dark:text-teal-400' },
  red:    { bg: 'bg-rose-100 dark:bg-red-500/20',      text: 'text-rose-600 dark:text-red-400' },
  purple: { bg: 'bg-accent-100 dark:bg-purple-500/20',text: 'text-accent-600 dark:text-purple-400' },
  green:  { bg: 'bg-emerald-100 dark:bg-green-500/20', text: 'text-emerald-600 dark:text-green-400' },
  amber:  { bg: 'bg-amber-100 dark:bg-amber-500/20',   text: 'text-amber-600 dark:text-amber-400' },
  gray:   { bg: 'bg-slate-100 dark:bg-slate-500/20',   text: 'text-slate-500 dark:text-slate-400' },
};

/* ── Builder: grouped by category ──────────────────────────── */

const BUILDER_GROUPS = [
  {
    label: 'Configure',
    items: [
      { to: '/builder/modules',      icon: Box,       label: 'Modules & Objects' },
      { to: '/builder/appearance',   icon: Palette,   label: 'Appearance Studio' },
      { to: '/builder/form',         icon: Layers,    label: 'Form Builder' },
      { to: '/builder/dashboard',    icon: BarChart2, label: 'Dashboard Builder' },
      // Reports are NOT an admin builder — every user builds their own, so the page
      // lives under Tools. This is a shortcut for admins wiring up dashboards, whose
      // widgets read saved reports.
      { to: '/reports',              icon: FileBarChart, label: 'Reports',
        title: 'Opens the shared Reports area — report building is available to every user, not just admins' },
      { to: '/builder/pipeline',     icon: Kanban,    label: 'Pipeline Builder' },
      { to: '/builder/wizard',       icon: List,      label: 'Wizards' },
      { to: '/builder/documents',    icon: FolderOpen, label: 'Document Management' },
    ],
  },
  {
    label: 'Automate',
    items: [
      { to: '/builder/workflow',     icon: Workflow,    label: 'Workflows' },
      { to: '/builder/assignment',   icon: UserCheck,   label: 'Assignment Rules' },
      { to: '/builder/lead-scoring', icon: Star,        label: 'Lead Scoring Rules' },
      { to: '/builder/sla',          icon: ShieldCheck, label: 'SLA Engine' },
    ],
  },
  {
    label: 'Connect',
    items: [
      { to: '/builder/integrations',        icon: Plug,     label: 'Integrations' },
      { to: '/builder/integration-health',  icon: Activity, label: 'Integration Health' },
      { to: '/builder/email-templates',     icon: Mail,     label: 'Email Templates' },
      { to: '/builder/social-media',        icon: Globe,    label: 'Social Media' },
      { to: '/builder/push-notifications',  icon: Bell,     label: 'Push Notifications' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/builder/permissions',  icon: Shield, label: 'Permissions' },
      { to: '/builder/employees',    icon: Users,   label: 'Employees' },
      { to: '/builder/org-chart',    icon: Network, label: 'Org Chart' },
      { to: '/builder/roles',        icon: Shield,  label: 'Roles & Levels' },
    ],
  },
];

const PLATFORM_LINKS = [
  { to: '/platform',              icon: Server,     label: 'Dashboard' },
  { to: '/platform/tenants',      icon: Building2,  label: 'Tenants' },
  { to: '/platform/feature-flags',icon: Flag,       label: 'Feature Flags' },
  { to: '/platform/plans',        icon: CreditCard, label: 'Plans' },
  { to: '/platform/announcements',icon: Bell,       label: 'Announcements' },
  { to: '/platform/analytics',    icon: BarChart2,  label: 'Analytics' },
  { to: '/platform/security',     icon: Lock,       label: 'Security' },
  { to: '/platform/audit-log',    icon: FileText,   label: 'Audit Log' },
];

/* ── Sidebar ───────────────────────────────────────────────── */

export default function Sidebar({ open, onClose }) {
  const { pathname } = useLocation();
  const { employee, isAdmin, isPlatformAdmin } = useAuthStore();
  const sidebarStyle = useAppearanceStore((s) => s.current['appearance.sidebar_style']);
  const onDarkChrome = sidebarStyle === 'dark' || sidebarStyle === 'brand';
  const [builderExpanded, setBuilderExpanded] = useState(pathname.startsWith('/builder'));
  const [platformExpanded, setPlatformExpanded] = useState(pathname.startsWith('/platform'));
  const [builderSearch, setBuilderSearch] = useState('');
  // A platform admin's default view is the platform console, not one tenant's
  // CRM. See the note on WorkspaceBoundary below for why.
  const [workspaceExpanded, setWorkspaceExpanded] = useState(
    () => !isPlatformAdmin() || !pathname.startsWith('/platform'),
  );

  const { data: modulesData, isLoading: modulesLoading } = useQuery({
    queryKey: ['runtime-modules'],
    queryFn:  runtimeService.getModules,
    staleTime: 300_000,
  });

  const modules = useMemo(() => modulesData?.data || [], [modulesData]);

  // Approvals waiting for this user — shown as a count on the Approvals link.
  const { data: approvalsData } = useQuery({
    queryKey: ['approvals', 'mine'],
    queryFn: () => runtimeService.getApprovals('mine'),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !isPlatformAdmin() || workspaceExpanded,
  });
  const pendingApprovals = (Array.isArray(approvalsData) ? approvalsData : approvalsData?.data ?? []).length;

  // Plan entitlements. Metadata modules are already filtered server-side in
  // bootstrap; this covers the bespoke tools and Builder sections the server
  // has no row for. A locked entry is hidden rather than shown-and-refused.
  const { has: entitled } = useEntitlements();
  const allowed = (to) => entitled(featureForPath(to));

  // Prefix matching, but "most specific link wins" within a group. `/platform`
  // is the prefix of every other console link, so matching per-link left the
  // Platform ▸ Dashboard entry permanently highlighted — and two entries lit at
  // once on `/platform/tenants`. See utils/navActive.js.
  const isActive = (to) => matchesPath(pathname, to);
  const isPlatformActive = useMemo(() => makeIsActive(pathname, PLATFORM_LINKS), [pathname]);
  const isBuilderActive = useMemo(
    () => makeIsActive(pathname, BUILDER_GROUPS.flatMap((g) => g.items)),
    [pathname],
  );

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) onClose();
  };

  // Group modules by category for sidebar sections
  const modulesByCategory = useMemo(() => {
    const grouped = {};
    for (const mod of modules) {
      const cat = mod.category || 'crm';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(mod);
    }
    // Categories are data: known ones keep their label and position, any other
    // key a module names becomes its own section (in module order) titled from
    // the key, so a new vertical needs no frontend change to get a sidebar group.
    return sidebarSections(grouped);
  }, [modules]);

  // Filter builder groups by search
  const filteredBuilderGroups = useMemo(() => {
    const q = builderSearch.trim().toLowerCase();
    return BUILDER_GROUPS
      .map(g => ({
        ...g,
        items: g.items.filter(i => allowed(i.to) && (!q || i.label.toLowerCase().includes(q))),
      }))
      .filter(g => g.items.length > 0);
    // `allowed` is derived from the entitlement set; recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderSearch, entitled]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        data-sidebar-root
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-sidebar flex flex-col',
          'bg-gradient-to-b from-white via-primary-50/40 to-accent-50/30 text-gray-700',
          'border-r border-primary-100/70 backdrop-blur-xl',
          'dark:from-night-1 dark:via-night-1 dark:to-night-1 dark:text-white dark:border-white/[0.06]',
          'transform transition-transform duration-300 ease-spring',
          'lg:relative lg:translate-x-0 lg:z-auto lg:transition-none',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-primary-100/70 dark:border-white/[0.06]">
          <Link to="/" className="flex items-center gap-2.5 group min-w-0 pressable">
            <BrandLogo size="md" onDark={onDarkChrome} />
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md hover:bg-primary-100 text-gray-500 dark:hover:bg-white/10 dark:text-white/70 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 sidebar-scroll">

          {/* Dashboard */}
          <NavItem
            to="/"
            icon={LayoutDashboard}
            label="Dashboard"
            active={pathname === '/'}
            onClick={handleLinkClick}
          />

          {/* ── The tenant-facing product ──────────────────────────────
              For a platform admin these are one specific workspace's data, so
              they sit behind a labelled boundary. Everyone else sees them
              inline exactly as before. */}
          {isPlatformAdmin() && (
            <WorkspaceBoundary
              expanded={workspaceExpanded}
              onToggle={() => setWorkspaceExpanded((v) => !v)}
              workspace={employee?.tenant_name}
            />
          )}

          <div className={clsx(isPlatformAdmin() && !workspaceExpanded && 'hidden')}>

          {/* Tools — available to every authenticated user (not a module, so
              it is not covered by the metadata-driven section below) */}
          <SectionLabel>Tools</SectionLabel>
          <NavItem
            to="/approvals"
            icon={ClipboardCheck}
            label={pendingApprovals ? `Approvals (${pendingApprovals})` : 'Approvals'}
            active={isActive('/approvals')}
            onClick={handleLinkClick}
            accent={pendingApprovals ? 'amber' : undefined}
          />
          <NavItem
            to="/reminders"
            icon={Bell}
            label="My Reminders"
            active={isActive('/reminders')}
            onClick={handleLinkClick}
          />
          <NavItem
            to="/web-forms"
            icon={Send}
            label="Web forms"
            active={isActive('/web-forms')}
            onClick={handleLinkClick}
          />
          {allowed('/reports') && <NavItem
            to="/reports"
            icon={BarChart2}
            label="Reports"
            active={isActive('/reports')}
            onClick={handleLinkClick}
          />}
          <NavItem
            to="/access"
            icon={Lock}
            label="Access & Barriers"
            active={isActive('/access')}
            onClick={handleLinkClick}
          />
          {allowed('/sla') && <NavItem
            to="/sla"
            icon={ShieldCheck}
            label="SLA Board"
            active={isActive('/sla')}
            onClick={handleLinkClick}
          />}
          {allowed('/social-media') && <NavItem
            to="/social-media"
            icon={Megaphone}
            label="Social Media"
            active={isActive('/social-media')}
            onClick={handleLinkClick}
          />}

          {/* Documents — standalone module, its own top-level section */}
          <SectionLabel>Documents</SectionLabel>
          {allowed('/documents') && <NavItem
            to="/documents"
            icon={FolderOpen}
            label="Document Management"
            active={isActive('/documents')}
            onClick={handleLinkClick}
          />}

          {/* Runtime modules — grouped by category. While they load, placeholder
              rows hold their place so the menu does not grow under the cursor. */}
          {modulesLoading && (
            <div aria-hidden="true" data-nav-placeholder className="px-3 pt-4 space-y-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-4 rounded bg-gray-200/70 dark:bg-white/[0.06] animate-pulse" style={{ width: `${60 + ((i * 17) % 35)}%` }} />
              ))}
            </div>
          )}
          {modulesByCategory.map((section) => (
            <div key={section.key}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.modules.map((mod) => (
                <NavItem
                  key={mod.id}
                  to={`/module/${mod.id}`}
                  icon={MODULE_ICONS[mod.icon] ?? Database}
                  label={mod.label}
                  active={isActive(`/module/${mod.id}`)}
                  colorChip={COLOR_CHIP[mod.color]}
                  onClick={handleLinkClick}
                />
              ))}
            </div>
          ))}

          {/* ── Builder (admin) ─────────────────────────────── */}
          {(isAdmin() || isPlatformAdmin()) && (
            <div className="pt-4">
              <button
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors select-none group"
                onClick={() => setBuilderExpanded(e => !e)}
              >
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-md bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center">
                    <Wrench className="h-3 w-3 text-primary-600 dark:text-primary-400" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-300">
                    Builder
                  </span>
                </div>
                <ChevronDown className={clsx(
                  'h-3 w-3 text-gray-400 dark:text-white/40 transition-transform duration-200',
                  !builderExpanded && '-rotate-90',
                )} />
              </button>

              {builderExpanded && (
                <div className="sb-group mt-1 ml-1 mr-1 rounded-xl border overflow-hidden">
                  {/* Inline search */}
                  <div className="px-2 pt-2 pb-1">
                    <div className="sb-field flex items-center gap-1.5 px-2 py-1 rounded-md border">
                      <Search className="h-3 w-3 text-gray-400 dark:text-white/30 shrink-0" />
                      <input
                        type="text"
                        placeholder="Search builder..."
                        value={builderSearch}
                        onChange={e => setBuilderSearch(e.target.value)}
                        className="bg-transparent text-[11px] text-gray-700 placeholder:text-gray-400 dark:text-white/80 dark:placeholder:text-white/30 w-full outline-none"
                      />
                    </div>
                  </div>

                  {/* Grouped links */}
                  <div className="px-1 pb-1.5 space-y-0.5">
                    {filteredBuilderGroups.map(group => (
                      <div key={group.label}>
                        <p className="px-2 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-white/30">
                          {group.label}
                        </p>
                        {group.items.map(link => (
                          <NavItem
                            key={link.to}
                            to={link.to}
                            icon={link.icon}
                            label={link.label}
                            title={link.title}
                            active={isBuilderActive(link.to)}
                            size="sm"
                            onClick={handleLinkClick}
                          />
                        ))}
                      </div>
                    ))}
                    {filteredBuilderGroups.length === 0 && (
                      <p className="px-3 py-3 text-[11px] text-gray-400 dark:text-white/30 text-center">No matches</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          </div>{/* end tenant-facing product */}

          {/* ── Platform Admin ──────────────────────────────── */}
          {isPlatformAdmin() && (
            <div className="pt-4">
              <button
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors select-none group"
                onClick={() => setPlatformExpanded(e => !e)}
              >
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-md bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                    <Crown className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-300">
                    Platform
                  </span>
                </div>
                <ChevronDown className={clsx(
                  'h-3 w-3 text-gray-400 dark:text-white/40 transition-transform duration-200',
                  !platformExpanded && '-rotate-90',
                )} />
              </button>

              {platformExpanded && (
                <div className="sb-group sb-group-amber mt-1 ml-1 mr-1 rounded-xl border overflow-hidden">
                  <div className="px-1 py-1.5 space-y-0.5">
                    {PLATFORM_LINKS.map(link => (
                      <NavItem
                        key={link.to}
                        to={link.to}
                        icon={link.icon}
                        label={link.label}
                        active={isPlatformActive(link.to)}
                        size="sm"
                        onClick={handleLinkClick}
                        accent="amber"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Settings (admin) ────────────────────────────── */}
          {(isAdmin() || isPlatformAdmin()) && (
            <div className="pt-4">
              <NavItem
                to="/settings"
                icon={Settings}
                label="Settings"
                active={isActive('/settings')}
                onClick={handleLinkClick}
              />
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="px-3 py-3 border-t border-primary-100/70 dark:border-white/[0.06] shrink-0">
          <div className="sb-user flex items-center gap-2.5 p-2 rounded-xl bg-white/60 border border-primary-100/60 dark:bg-transparent dark:border-transparent">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-500 via-mid to-accent-500 flex items-center justify-center text-on-primary text-xs font-semibold uppercase shrink-0 shadow-primary">
              {employee?.employee_name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate leading-tight">
                {employee?.employee_name}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-white/60 capitalize truncate leading-tight">
                {employee?.role_label ?? employee?.role?.replaceAll('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function SectionLabel({ children }) {
  return (
    <div className="pt-3 pb-1 px-2">
      <p className="sb-muted text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/50 select-none">
        {children}
      </p>
    </div>
  );
}

/**
 * The line between the platform console and one tenant's CRM.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A platform admin was shown Tools, Documents, every runtime module and the
 * whole Builder inline, with nothing saying whose data any of it was. It is
 * one tenant's: `PLATFORM01` carries a `tenant_id` like every other employee
 * (the column is non-nullable), so those sections render the workspace that
 * employee happens to belong to — the demo tenant on a seeded install. An
 * operator reasonably reads them as platform-wide and they are not.
 *
 * Every major CRM keeps these two surfaces apart rather than interleaved:
 * Salesforce puts partner/org management in a separate Partner Business Org
 * (Environment Hub, LMA); Dynamics 365 puts it on a different site altogether
 * (Power Platform Admin Center); HubSpot makes you switch accounts out of the
 * partner portal; Zoho and Freshworks both use a distinct admin console
 * (Zoho Directory, Neo Admin Center). In all of them you reach a customer's
 * data by explicitly entering that customer, never by browsing modules from
 * the console.
 *
 * Access is deliberately not removed — a support engineer needs a way in, and
 * taking it away would be a bigger change than the confusion warrants. What
 * changes is that entering a workspace is now an explicit, named act, and the
 * console is what a platform admin lands on.
 */
function WorkspaceBoundary({ expanded, onToggle, workspace }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-3 w-full rounded-xl border border-dashed border-gray-300 px-2.5 py-2 text-left transition-colors hover:border-gray-400 hover:bg-white/60 dark:border-white/15 dark:hover:border-white/25 dark:hover:bg-white/[0.04]"
      title="These sections show one workspace's own data, not platform-wide data"
    >
      <span className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-white/10">
          <Eye className="h-3 w-3 text-gray-500 dark:text-white/50" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
            Workspace view
          </span>
          <span className="block truncate text-[10px] text-gray-400 dark:text-white/30">
            {workspace ? `${workspace} — one tenant's data` : "One tenant's own data"}
          </span>
        </span>
        <ChevronRight className={clsx(
          'h-3 w-3 shrink-0 text-gray-400 transition-transform duration-200 dark:text-white/40',
          expanded && 'rotate-90',
        )} />
      </span>
    </button>
  );
}

function NavItem({ to, icon: Icon, label, active, size = 'md', colorChip, onClick, accent, title }) {
  const isAmber = accent === 'amber';
  return (
    <Link
      to={to}
      onClick={onClick}
      title={title}
      className={clsx(
        'sb-item relative flex items-center gap-2.5 rounded-xl transition-all duration-150 select-none group',
        'hover:translate-x-0.5', active && 'sb-item-active',
        size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-2.5 py-2 text-[13px]',
        active
          ? isAmber
            ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white font-semibold shadow-[0_6px_16px_-6px_rgba(245,158,11,0.6)] dark:from-amber-400/20 dark:to-amber-400/10 dark:text-amber-200 dark:shadow-none'
            : 'bg-gradient-to-r from-primary-500 via-mid to-accent-500 text-on-primary font-semibold shadow-primary dark:from-white/[0.09] dark:via-white/[0.09] dark:to-white/[0.09] dark:text-white dark:shadow-none'
          : isAmber
            ? 'text-amber-700/80 hover:bg-amber-100/70 hover:text-amber-800 dark:text-amber-100/70 dark:hover:bg-amber-400/[0.06] dark:hover:text-amber-100'
            : 'text-gray-600 hover:bg-white/80 hover:text-primary-700 hover:shadow-sm dark:text-white/80 dark:hover:bg-white/[0.05] dark:hover:text-white',
      )}
    >
      {colorChip && !active ? (
        <span className={clsx('sb-chip h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', colorChip.bg, colorChip.text)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : colorChip && active ? (
        <span className="sb-chip h-6 w-6 rounded-lg flex items-center justify-center shrink-0 bg-white/25 text-white">
          <Icon className="h-3.5 w-3.5" />
        </span>
      ) : (
        <Icon className={size === 'sm' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
      )}
      <span className="truncate">{label}</span>
      {active && (
        <span className="sb-dot ml-auto h-1.5 w-1.5 rounded-full shrink-0 bg-white/90" />
      )}
    </Link>
  );
}
