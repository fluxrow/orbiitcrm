import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import SetupPage from "./pages/SetupPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AcceptInviteSaasPage from "./pages/AcceptInviteSaasPage";
import DocumentacaoPage from "./pages/DocumentacaoPage";

// Orbit CRM Pages
import OrbitDashboard from "./pages/orbit/OrbitDashboard";
import ProspectsPage from "./pages/orbit/ProspectsPage";
import ConversasPage from "./pages/orbit/ConversasPage";
import FunilPage from "./pages/orbit/FunilPage";
import CampanhasPage from "./pages/orbit/CampanhasPage";
import TemplatesPage from "./pages/orbit/TemplatesPage";
import LeadFinderPage from "./pages/orbit/LeadFinderPage";
import ConfigPage from "./pages/orbit/ConfigPage";
import AnalyticsPage from "./pages/orbit/AnalyticsPage";
import UsuariosEmpresaPage from "./pages/orbit/UsuariosEmpresaPage";

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
import ClientesPage from "./pages/pe-admin/ClientesPage";
import ClienteDetailPage from "./pages/pe-admin/ClienteDetailPage";
import ContatosPage from "./pages/pe-admin/ContatosPage";
import SegmentosPage from "./pages/pe-admin/SegmentosPage";
import OrigensPage from "./pages/pe-admin/OrigensPage";
import ImportacaoPage from "./pages/pe-admin/ImportacaoPage";
import ProdutosPage from "./pages/pe-admin/ProdutosPage";
import FunilEtapasPage from "./pages/pe-admin/FunilEtapasPage";
import OportunidadesPage from "./pages/pe-admin/OportunidadesPage";
import OportunidadesKanbanPage from "./pages/pe-admin/OportunidadesKanbanPage";
import OportunidadeDetailPage from "./pages/pe-admin/OportunidadeDetailPage";
import TarefasPage from "./pages/pe-admin/TarefasPage";
import TenantMapPage from "./pages/pe-admin/TenantMapPage";

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
    return <Navigate to="/orbit" replace />;
  }

  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/setup" element={<SetupPage />} />
    <Route path="/invite/:token" element={<AcceptInvitePage />} />
    <Route path="/accept-invite" element={<AcceptInviteSaasPage />} />
    <Route path="/documentacao" element={<DocumentacaoPage />} />
    <Route path="/" element={<Navigate to="/orbit" replace />} />
    
    {/* Protected Orbit CRM Routes */}
    <Route path="/orbit" element={<ProtectedRoute><OrbitDashboard /></ProtectedRoute>} />
    <Route path="/orbit/prospects" element={<ProtectedRoute><ProspectsPage /></ProtectedRoute>} />
    <Route path="/orbit/conversas" element={<ProtectedRoute><ConversasPage /></ProtectedRoute>} />
    <Route path="/orbit/funil" element={<ProtectedRoute><FunilPage /></ProtectedRoute>} />
    <Route path="/orbit/campanhas" element={<ProtectedRoute><CampanhasPage /></ProtectedRoute>} />
    <Route path="/orbit/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
    <Route path="/orbit/lead-finder" element={<ProtectedRoute><LeadFinderPage /></ProtectedRoute>} />
    <Route path="/orbit/config" element={<ProtectedRoute><ConfigPage /></ProtectedRoute>} />
    <Route path="/orbit/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
    <Route path="/orbit/usuarios" element={<ProtectedRoute><UsuariosEmpresaPage /></ProtectedRoute>} />
    
    {/* Legacy Super Admin Routes */}
    <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
    <Route path="/super-admin/empresas" element={<SuperAdminRoute><EmpresasPage /></SuperAdminRoute>} />
    <Route path="/super-admin/empresas/:id/usuarios" element={<SuperAdminRoute><EmpresaUsersPage /></SuperAdminRoute>} />
    <Route path="/super-admin/usuarios" element={<SuperAdminRoute><UsuariosGlobaisPage /></SuperAdminRoute>} />

    {/* PE Admin Routes */}
    <Route path="/pe-admin" element={<PeAdminLayout />}>
      <Route index element={<Navigate to="/pe-admin/organizations" replace />} />
      <Route path="organizations" element={<OrganizationsPage />} />
      <Route path="organizations/:id/users" element={<PeOrgUsersPage />} />
      <Route path="users" element={<PeGlobalUsersPage />} />
      <Route path="clientes" element={<ClientesPage />} />
      <Route path="clientes/:id" element={<ClienteDetailPage />} />
      <Route path="contatos" element={<ContatosPage />} />
      <Route path="segmentos" element={<SegmentosPage />} />
      <Route path="origens" element={<OrigensPage />} />
      <Route path="importacao" element={<ImportacaoPage />} />
      <Route path="produtos" element={<ProdutosPage />} />
      <Route path="funil" element={<FunilEtapasPage />} />
      <Route path="oportunidades" element={<OportunidadesPage />} />
      <Route path="oportunidades/kanban" element={<OportunidadesKanbanPage />} />
      <Route path="oportunidades/:id" element={<OportunidadeDetailPage />} />
      <Route path="tarefas" element={<TarefasPage />} />
      <Route path="tenants" element={<TenantMapPage />} />
      <Route path="audit" element={<PeAuditLogPage />} />
    </Route>

    {/* Org Routes */}
    <Route path="/org/users" element={<ProtectedRoute><OrgUsersPage /></ProtectedRoute>} />
    
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
