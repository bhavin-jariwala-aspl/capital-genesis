import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useAppearanceStore } from './store/appearanceStore';
import { useCurrencyStore } from './store/currencyStore';
import { useBootstrap } from './hooks/useBootstrap';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import FeatureGate from './components/layout/FeatureGate';
import ErrorBoundary from './components/ui/ErrorBoundary';
import DialogHost from './components/ui/DialogHost';

// ── Eager-loaded (public / shell — must be available with no delay) ───────────
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
const SharedDocumentPage = lazy(() => import('./pages/SharedDocumentPage'));
const SignDocumentPage = lazy(() => import('./pages/SignDocumentPage'));

// ── Lightweight route-load spinner (avoids importing Spinner component eagerly) ─
function PageLoader() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
    </div>
  );
}

// ── Runtime pages (lazy) ─────────────────────────────────────────────────────
const RuntimeHome        = lazy(() => import('./pages/runtime/RuntimeHome'));
const OrganizationSettings = lazy(() => import('./pages/OrganizationSettings'));
const ModulePage         = lazy(() => import('./pages/runtime/ModulePage'));
const RecordFormPage     = lazy(() => import('./pages/runtime/RecordFormPage'));
const WizardPage         = lazy(() => import('./pages/runtime/WizardPage'));
const ForecastPage       = lazy(() => import('./pages/runtime/ForecastPage'));
const ImportPage         = lazy(() => import('./pages/runtime/ImportPage'));
const DocumentsPage      = lazy(() => import('./pages/runtime/DocumentsPage'));
// Tier 1 pages converted to metadata-driven: Products, CallLogs, LeadScoring
// They now render via ModulePage at /module/:moduleId — no dedicated routes needed.
const QuotesPage         = lazy(() => import('./pages/runtime/QuotesPage'));
const SocialMediaPage    = lazy(() => import('./pages/runtime/SocialMediaPage'));
const SlaDashboardPage   = lazy(() => import('./pages/runtime/SlaDashboardPage'));
const ReportsPage        = lazy(() => import('./pages/runtime/ReportsPage'));
const RemindersPage      = lazy(() => import('./pages/runtime/RemindersPage'));

// ── Insurance pages (heavy — always lazy) ────────────────────────────────────
const InsuranceQuotePage = lazy(() => import('./pages/runtime/InsuranceQuotePage'));
const PoliciesPage       = lazy(() => import('./pages/runtime/PoliciesPage'));
const ApplicationsPage   = lazy(() => import('./pages/runtime/ApplicationsPage'));
const ClaimsPage         = lazy(() => import('./pages/runtime/ClaimsPage'));
const UnderwritingPage   = lazy(() => import('./pages/runtime/UnderwritingPage'));
const CommissionsPage    = lazy(() => import('./pages/runtime/CommissionsPage'));
const AgentWorkbenchPage = lazy(() => import('./pages/runtime/AgentWorkbenchPage'));
const DeclarationPage    = lazy(() => import('./pages/runtime/DeclarationPage'));
const DocumentCollectionPage = lazy(() => import('./pages/runtime/DocumentCollectionPage'));
const UnderwritingCaseReviewPage = lazy(() => import('./pages/runtime/UnderwritingCaseReviewPage'));

// ── Builder pages (admin-only — always lazy) ─────────────────────────────────
const BuilderHome              = lazy(() => import('./pages/builder/BuilderHome'));
const ModuleBuilder            = lazy(() => import('./pages/builder/ModuleBuilder'));
const FormBuilderPage          = lazy(() => import('./pages/builder/FormBuilderPage'));
const DashboardBuilderPage     = lazy(() => import('./pages/builder/DashboardBuilderPage'));
const PipelineBuilderPage      = lazy(() => import('./pages/builder/PipelineBuilderPage'));
const RecordsTrashPage         = lazy(() => import('./pages/builder/RecordsTrashPage'));
const WorkflowBuilderPage      = lazy(() => import('./pages/builder/WorkflowBuilderPage'));
const WizardBuilderPage        = lazy(() => import('./pages/builder/WizardBuilderPage'));
const PermissionsBuilderPage   = lazy(() => import('./pages/builder/PermissionsBuilderPage'));
const AssignmentBuilderPage    = lazy(() => import('./pages/builder/AssignmentBuilderPage'));
const IntegrationBuilderPage   = lazy(() => import('./pages/builder/IntegrationBuilderPage'));
const EmailTemplateBuilderPage = lazy(() => import('./pages/builder/EmailTemplateBuilderPage'));
const SocialMediaBuilderPage   = lazy(() => import('./pages/builder/SocialMediaBuilderPage'));
const LeadScoringBuilderPage   = lazy(() => import('./pages/builder/LeadScoringBuilderPage'));
const IntegrationHealthPage    = lazy(() => import('./pages/builder/IntegrationHealthPage'));
const PushNotificationsPage    = lazy(() => import('./pages/builder/PushNotificationsPage'));
const EmployeesPage            = lazy(() => import('./pages/builder/EmployeesPage'));
const RolesPage                = lazy(() => import('./pages/builder/RolesPage'));
const OrgChartPage             = lazy(() => import('./pages/builder/OrgChartPage'));
const SlaBuilderPage           = lazy(() => import('./pages/builder/SlaBuilderPage'));
const ReportBuilderPage        = lazy(() => import('./pages/runtime/ReportBuilderPage'));
const DocumentBuilderPage      = lazy(() => import('./pages/builder/DocumentBuilderPage'));
const AppearanceBuilderPage    = lazy(() => import('./pages/builder/AppearanceBuilderPage'));

// ── Platform pages (platform-admin-only — always lazy) ───────────────────────
const PlatformDashboard  = lazy(() => import('./pages/platform/PlatformDashboard'));
const TenantsPage        = lazy(() => import('./pages/platform/TenantsPage'));
const FeatureFlagsPage   = lazy(() => import('./pages/platform/FeatureFlagsPage'));
const AnnouncementsPage  = lazy(() => import('./pages/platform/AnnouncementsPage'));
const AuditLogPage       = lazy(() => import('./pages/platform/AuditLogPage'));
const SecurityPage       = lazy(() => import('./pages/platform/SecurityPage'));
const AnalyticsPage      = lazy(() => import('./pages/platform/AnalyticsPage'));
const PlansPage          = lazy(() => import('./pages/platform/PlansPage'));

function App() {
  const { token } = useAuthStore();
  const initTheme = useThemeStore(s => s.initTheme);
  const initCurrency = useCurrencyStore(s => s.initCurrency);

  // Apply persisted theme class to <html> on first render and follow the OS
  // when the user chose "Auto" in the Personalize panel.
  const watchSystem = useThemeStore(s => s.watchSystem);
  useEffect(() => { initTheme(); return watchSystem(); }, [initTheme, watchSystem]);

  // Load the tenant's display currency so every amount renders in it.
  // Re-runs on token change: a different login can mean a different tenant.
  useEffect(() => {
    if (token) initCurrency();
  }, [token, initCurrency]);

  // Apply the tenant's Appearance & Branding (colours, radius, density, font,
  // default mode) as soon as we know who is signed in. Signed out, the sign-in
  // page wears the last remembered workspace brand (or the product defaults).
  const loadAppearance = useAppearanceStore((s) => s.load);
  const applyPreLogin  = useAppearanceStore((s) => s.applyPreLoginBranding);
  useEffect(() => {
    if (token) loadAppearance();
    else applyPreLogin();
  }, [token, loadAppearance, applyPreLogin]);

  // Bootstrap metadata cache on login / app start
  useBootstrap();

  return (
    <ErrorBoundary fallbackMessage="The application encountered an unexpected error. Please refresh the page.">
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Public shared-document landing (records view/download engagement) */}
            <Route path="/share/:token" element={<SharedDocumentPage />} />
            {/* Public e-signature signing page */}
            <Route path="/sign/:token" element={<SignDocumentPage />} />
          
          {/* Protected Routes */}
          <Route element={token ? <AppLayout /> : <Navigate to="/login" replace />}>
            {/* Runtime Routes */}
            <Route path="/" element={<RuntimeHome />} />
            <Route path="/module/:moduleId" element={<ModulePage />} />
            <Route path="/module/:moduleId/object/:objectId" element={<ModulePage />} />
            <Route path="/module/:moduleId/object/:objectId/new" element={<RecordFormPage />} />
            <Route path="/module/:moduleId/object/:objectId/edit/:recordId" element={<RecordFormPage />} />
            {/* Legacy routes kept for any direct links */}
            <Route path="/record/:objectId/new" element={<RecordFormPage />} />
            <Route path="/record/:objectId/:recordId" element={<RecordFormPage />} />
            <Route path="/wizard/:wizardId" element={<WizardPage />} />
            {/* Plan-gated. FeatureGate infers the feature from the path (see
                utils/featureMap.js) and shows a locked-feature page instead of
                rendering a screen the API will refuse. */}
            <Route element={<FeatureGate />}>
              <Route path="/forecast" element={<ForecastPage />} />
              <Route path="/import" element={<ImportPage />} />
              {/* Products, CallLogs, LeadScoring are now metadata-driven via /module/:moduleId */}
              <Route path="/quotes" element={<QuotesPage />} />
              <Route path="/social-media" element={<SocialMediaPage />} />
              <Route path="/sla" element={<SlaDashboardPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              {/* Standalone Document Management module (domain-neutral) */}
              <Route path="/documents" element={<DocumentsPage />} />
              {/* Report authoring is deliberately OUTSIDE the admin-only /builder guard
                  below: the whole point of the feature is that any user builds their
                  own reports. See docs/developer-guide/REPORTING.md. */}
              <Route path="/reports/new" element={<ReportBuilderPage />} />
              <Route path="/reports/:id/edit" element={<ReportBuilderPage />} />

              {/* Life Insurance Routes */}
              <Route path="/insurance/quotes" element={<InsuranceQuotePage />} />
              <Route path="/insurance/policies" element={<PoliciesPage />} />
              <Route path="/insurance/applications" element={<ApplicationsPage />} />
              <Route path="/insurance/declarations" element={<DeclarationPage />} />
              <Route path="/insurance/documents" element={<DocumentCollectionPage />} />
              <Route path="/insurance/claims" element={<ClaimsPage />} />
              <Route path="/insurance/underwriting" element={<UnderwritingPage />} />
              <Route path="/insurance/underwriting/:id" element={<UnderwritingCaseReviewPage />} />
              <Route path="/insurance/commissions" element={<CommissionsPage />} />
              <Route path="/insurance/workbench" element={<AgentWorkbenchPage />} />
            </Route>

            {/* Admin-only application settings */}
            <Route element={<ProtectedRoute roles={['admin', 'super_admin', 'platform_admin']} />}>
              <Route path="/settings" element={<OrganizationSettings />} />
            </Route>

            {/* Builder Routes (Admin Only) */}
            <Route element={<ProtectedRoute roles={['admin', 'super_admin', 'platform_admin']} />}>
             <Route element={<FeatureGate />}>
              <Route path="/builder" element={<BuilderHome />} />
              <Route path="/builder/modules" element={<ModuleBuilder />} />
              <Route path="/builder/appearance" element={<AppearanceBuilderPage />} />
              <Route path="/builder/form" element={<FormBuilderPage />} />
              <Route path="/builder/form/:formId" element={<FormBuilderPage />} />
              <Route path="/builder/dashboard" element={<DashboardBuilderPage />} />
              <Route path="/builder/dashboard/:dashId" element={<DashboardBuilderPage />} />
              <Route path="/builder/pipeline" element={<PipelineBuilderPage />} />
              <Route path="/builder/trash" element={<RecordsTrashPage />} />
              <Route path="/builder/workflow" element={<WorkflowBuilderPage />} />
              <Route path="/builder/wizard" element={<WizardBuilderPage />} />
              <Route path="/builder/permissions" element={<PermissionsBuilderPage />} />
              <Route path="/builder/assignment" element={<AssignmentBuilderPage />} />
              <Route path="/builder/integrations" element={<IntegrationBuilderPage />} />
              <Route path="/builder/email-templates" element={<EmailTemplateBuilderPage />} />
              <Route path="/builder/social-media" element={<SocialMediaBuilderPage />} />
              <Route path="/builder/lead-scoring" element={<LeadScoringBuilderPage />} />
              <Route path="/builder/integration-health" element={<IntegrationHealthPage />} />
              <Route path="/builder/push-notifications" element={<PushNotificationsPage />} />
              <Route path="/builder/employees" element={<EmployeesPage />} />
              <Route path="/builder/org-chart" element={<OrgChartPage />} />
              <Route path="/builder/sla" element={<SlaBuilderPage />} />
              <Route path="/builder/documents" element={<DocumentBuilderPage />} />
              <Route path="/builder/roles" element={<RolesPage />} />
             </Route>
            </Route>

            {/* Platform Admin Routes (Platform Admin Only) */}
            <Route element={<ProtectedRoute roles={['platform_admin']} />}>
              <Route path="/platform" element={<PlatformDashboard />} />
              <Route path="/platform/tenants" element={<TenantsPage />} />
              <Route path="/platform/feature-flags" element={<FeatureFlagsPage />} />
              <Route path="/platform/plans" element={<PlansPage />} />
              <Route path="/platform/announcements" element={<AnnouncementsPage />} />
              <Route path="/platform/analytics" element={<AnalyticsPage />} />
              <Route path="/platform/security" element={<SecurityPage />} />
              <Route path="/platform/audit-log" element={<AuditLogPage />} />
            </Route>
          </Route>
          
          {/* Catch all - redirect to home or login */}
          <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <DialogHost />
    </ErrorBoundary>
  );
}

export default App;
