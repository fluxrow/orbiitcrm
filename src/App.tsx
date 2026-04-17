import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import LandingPage from "./pages/LandingPage";
import TrialPage from "./pages/TrialPage";
import SetupPage from "./pages/SetupPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AcceptInviteSaasPage from "./pages/AcceptInviteSaasPage";
import DocumentacaoPage from "./pages/DocumentacaoPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PublicLayout from "./layouts/PublicLayout";

// Tenant Layout
import TenantLayout from "./pages/tenant/TenantLayout";

// Orbit CRM Pages
import OrbitDashboard from "./pages/orbit/OrbitDashboard";
import ProspectsPage from "./pages/orbit/ProspectsPage";
import ConversasPage from "./pages/orbit/ConversasPage";
import FunilPage from "./pages/orbit/FunilPage";
import CampanhasPage from "./pages/orbit/CampanhasPage";
import TemplatesPage from "./pages/orbit/TemplatesPage";
import EmailTemplateEditorPage from "./pages/orbit/EmailTemplateEditorPage";
import LeadFinderPage from "./pages/orbit/LeadFinderPage";
import ConfigPage from "./pages/orbit/ConfigPage";
import AnalyticsPage from "./pages/orbit/AnalyticsPage";
import MeuPlanoPage from "./pages/orbit/MeuPlanoPage";
import UsuariosEmpresaPage from "./pages/orbit/UsuariosEmpresaPage";
import TarefasPage from "./pages/orbit/TarefasPage";
import NovaCampanhaPage from "./pages/orbit/NovaCampanhaPage";

// Super Admin Pages (legacy)
import SuperAdminDashboard from "./pages/super-admin/SuperAdminDashboard";
import EmpresasPage from "./pages/super-admin/EmpresasPage";
import EmpresaUsersPage from "./pages/super-admin/EmpresaUsersPage";
import UsuariosGlobaisPage from "./pages/super-admin/UsuariosGlobaisPage";

// PE Admin Pages
import PeAdminLayout from "./pages/pe-admin/PeAdminLayout";
import OrganizationsPage from "./pages/pe-admin/OrganizationsPage";
import PeOrgUsersPage from "./pages/pe-admin/PeOrgUsersPage";
import PeGlobalUsersPage from "./pages/pe-admin/GlobalUsersPage";
import PeAuditLogPage from "./pages/pe-admin/AuditLogPage";
import TenantMapPage from "./pages/pe-admin/TenantMapPage";
import PeAdminDocPage from "./pages/pe-admin/PeAdminDocPage";
import CadastrosPage from "./pages/pe-admin/CadastrosPage";
import PlanosPage from "./pages/pe-admin/PlanosPage";

// Org Pages
import OrgUsersPage from "./pages/org/OrgUsersPage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { hasRole: isSuperAdmin, isLoading: roleLoading } = useIsSuperAdmin();

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/demo" replace />;
  }

  return <>{children}</>;
}

// Nested orbit routes (each page wraps itself with OrbitLayout)
function OrbitRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<OrbitDashboard />} />
      <Route path="prospects" element={<ProspectsPage />} />
      <Route path="conversas" element={<ConversasPage />} />
      <Route path="funil" element={<FunilPage />} />
      <Route path="campanhas" element={<CampanhasPage />} />
      <Route path="campanhas/nova" element={<NovaCampanhaPage />} />
      <Route path="campanhas/:id/editar" element={<NovaCampanhaPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="templates/email/new" element={<EmailTemplateEditorPage />} />
      <Route path="templates/email/:id/edit" element={<EmailTemplateEditorPage />} />
      <Route path="lead-finder" element={<LeadFinderPage />} />
      <Route path="config" element={<ConfigPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="tarefas" element={<TarefasPage />} />
      <Route path="meu-plano" element={<MeuPlanoPage />} />
      <Route path="usuarios" element={<UsuariosEmpresaPage />} />
    </Routes>
  );
}

// Compatibility: redirect /orbit/* to /demo/*
function OrbitRedirect() {
  const path = window.location.pathname.replace(/^\/orbit\/?/, "");
  return <Navigate to={`/demo/${path || "dashboard"}`} replace />;
}

const AppRoutes = () => (
  <Routes>
    {/* Public routes with hotsite header */}
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/trial" element={<TrialPage />} />
      <Route path="/documentacao" element={<DocumentacaoPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/accept-invite-pe/:token" element={<AcceptInvitePage />} />
      <Route path="/accept-invite" element={<AcceptInviteSaasPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Route>
    
    {/* Compatibility redirect: /orbit/* → /demo/* */}
    <Route path="/orbit/*" element={<OrbitRedirect />} />
    <Route path="/orbit" element={<Navigate to="/demo/dashboard" replace />} />

    {/* Demo tenant routes */}
    <Route path="/demo" element={<TenantLayout isDemo />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<OrbitRoutes />} />
    </Route>

    {/* Legacy Super Admin Routes */}
    <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
    <Route path="/super-admin/empresas" element={<SuperAdminRoute><EmpresasPage /></SuperAdminRoute>} />
    <Route path="/super-admin/empresas/:id/usuarios" element={<SuperAdminRoute><EmpresaUsersPage /></SuperAdminRoute>} />
    <Route path="/super-admin/usuarios" element={<SuperAdminRoute><UsuariosGlobaisPage /></SuperAdminRoute>} />

    {/* PE Admin Routes */}
    <Route path="/pe-admin" element={<PeAdminLayout />}>
      <Route index element={<Navigate to="/pe-admin/cadastros" replace />} />
      <Route path="cadastros" element={<CadastrosPage />} />
      <Route path="organizations" element={<OrganizationsPage />} />
      <Route path="organizations/:id/users" element={<PeOrgUsersPage />} />
      <Route path="users" element={<PeGlobalUsersPage />} />
      <Route path="planos" element={<PlanosPage />} />
      <Route path="tenants" element={<TenantMapPage />} />
      <Route path="audit" element={<PeAuditLogPage />} />
      <Route path="documentacao" element={<PeAdminDocPage />} />
      <Route path="*" element={<Navigate to="/pe-admin/cadastros" replace />} />
    </Route>

    {/* Org Routes */}
    <Route path="/org/users" element={<ProtectedRoute><OrgUsersPage /></ProtectedRoute>} />

    {/* Slug tenant routes (catch-all, must be last) */}
    <Route path="/:slug" element={<TenantLayout />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<OrbitRoutes />} />
    </Route>
    
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
