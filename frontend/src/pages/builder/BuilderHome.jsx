import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import Spinner from '../../components/ui/Spinner';
import { Layers, FileText, LayoutDashboard, GitBranch, BookOpen, ArrowRight, Shield, UserCheck, Plug, Mail, Kanban, Globe, Wrench, FolderOpen, Palette } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';

const BUILDER_SECTIONS = [
  {
    title: 'Modules & Objects',
    description: 'Create and manage data modules, objects, and field definitions.',
    href: '/builder/modules',
    icon: Layers,
    color: 'bg-blue-50 text-blue-600',
  },
  {
    title: 'Appearance Studio',
    description: 'Themes, brand colours, logo and favicon, corners, surfaces, typography, dark mode, sign-in page and chart palette — applied live for everyone.',
    href: '/builder/appearance',
    icon: Palette,
    color: 'bg-pink-50 text-pink-600',
  },
  {
    title: 'Form Builder',
    description: 'Design drag-and-drop forms with validations, dependencies, and auto-populate functions.',
    href: '/builder/form',
    icon: FileText,
    color: 'bg-purple-50 text-purple-600',
  },
  {
    title: 'Dashboard Builder',
    description: 'Compose dashboards with draggable, resizable chart and widget tiles.',
    href: '/builder/dashboard',
    icon: LayoutDashboard,
    color: 'bg-green-50 text-green-600',
  },
  {
    title: 'Pipeline Builder',
    description: 'Configure kanban-style pipelines with custom stages for leads, opportunities, and more.',
    href: '/builder/pipeline',
    icon: Kanban,
    color: 'bg-sky-50 text-sky-600',
  },
  {
    title: 'Workflow Builder',
    description: 'Define multi-step automation workflows with conditions, actions, and notifications.',
    href: '/builder/workflow',
    icon: GitBranch,
    color: 'bg-orange-50 text-orange-600',
  },
  {
    title: 'Wizard Builder',
    description: 'Create guided multi-step wizards linked to forms for structured data entry.',
    href: '/builder/wizard',
    icon: BookOpen,
    color: 'bg-pink-50 text-pink-600',
  },
  {
    title: 'Permission Management',
    description: 'Configure role-based view, edit and scope permissions for tasks, activities, and all metadata entities.',
    href: '/builder/permissions',
    icon: Shield,
    color: 'bg-primary-50 text-primary-600',
  },
  {
    title: 'Assignment Rules',
    description: 'Configure how new records are auto-assigned: fixed, round-robin, rule-based, or load-balanced.',
    href: '/builder/assignment',
    icon: UserCheck,
    color: 'bg-teal-50 text-teal-600',
  },
  {
    title: 'Integrations',
    description: 'Manage outbound webhooks and service connectors. Test and view execution logs.',
    href: '/builder/integrations',
    icon: Plug,
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    title: 'Email Templates',
    description: 'Create and manage email templates with dynamic variables for personalized communications.',
    href: '/builder/email-templates',
    icon: Mail,
    color: 'bg-violet-50 text-violet-600',
  },
  {
    title: 'Social Media',
    description: 'Connect corporate social accounts, manage posts, campaigns, brand mentions, and listening keywords.',
    href: '/builder/social-media',
    icon: Globe,
    color: 'bg-rose-50 text-rose-600',
  },
  {
    title: 'Document Management',
    description: 'Configure document categories, per-category upload rules, review policy, retention, and required-document checklists.',
    href: '/builder/documents',
    icon: FolderOpen,
    color: 'bg-amber-50 text-amber-600',
  },
];

function StatCard({ label, value, loading }) {
  return (
    <div className="card p-4 text-center">
      {loading ? (
        <Spinner size="sm" className="mx-auto" />
      ) : (
        <p className="text-3xl font-bold text-primary-600">{value ?? '—'}</p>
      )}
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

export default function BuilderHome() {
  const { data: formsData, isLoading: formsLoading } = useQuery({
    queryKey: ['builder-forms-count'],
    queryFn: () => builderService.getForms?.() || Promise.resolve({ data: [] }),
  });
  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['builder-dashboards-count'],
    queryFn: () => builderService.getDashboards(),
  });
  const { data: wfData, isLoading: wfLoading } = useQuery({
    queryKey: ['builder-workflows-count'],
    queryFn: () => builderService.getWorkflows(),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        icon={Wrench}
        eyebrow="Builder"
        title="Builder Studio"
        subtitle="Design and configure every aspect of your CRM metadata."
      />

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <StatCard label="Dashboards" value={dashData?.data?.length} loading={dashLoading} />
        <StatCard label="Workflows" value={wfData?.data?.length} loading={wfLoading} />
        <StatCard label="Forms" value={formsData?.data?.length} loading={formsLoading} />
        <StatCard label="Builder Sections" value={BUILDER_SECTIONS.length} />
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {BUILDER_SECTIONS.map(section => {
          const Icon = section.icon;
          return (
            <Link key={section.href} to={section.href} className="card p-5 group hover:shadow-elevated transition-shadow">
              <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${section.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-700 transition-colors">
                {section.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{section.description}</p>
              <div className="flex items-center gap-1 mt-4 text-primary-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Open <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
