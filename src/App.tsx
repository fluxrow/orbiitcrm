import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIsSuperAdmin } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import SetupPage from "./pages/SetupPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import AcceptInviteSaasPage from "./pages/AcceptInviteSaasPage";
import DocumentacaoPage from "./pages/DocumentacaoPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SelectEmpresaPage from "./pages/SelectEmpresaPage";
import ApresentacaoOrbit2026 from "./pages/ApresentacaoOrbit2026";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import PublicLayout from "./layouts/PublicLayout";
import LandingPage from "./pages/LandingPage";
import OAuthConsentPage from "./pages/OAuthConsentPage";

// Tenant Layout
import TenantLayout from "./pages/tenant/TenantLayout";

// Orbit CRM Pages
import ProspectsPage from "./pages/orbit/ProspectsPage";
import ConversasPage from "./pages/orbit/ConversasPage";
import OrbitDashboard from "./pages/orbit/OrbitDashboard";
import FunilPage from "./pages/orbit/FunilPage";
import CampanhasPage from "./pages/orbit/CampanhasPage";
import TemplatesPage from "./pages/orbit/TemplatesPage";
import EmailTemplateEditorPage from "./pages/orbit/EmailTemplateEditorPage";
import OmnichannelInboxPage from "./pages/orbit/OmnichannelInboxPage";

import ConfigPage from "./pages/orbit/ConfigPage";
import AnalyticsPage from "./pages/orbit/AnalyticsPage";
import MeuPlanoPage from "./pages/orbit/MeuPlanoPage";
import UsuariosEmpresaPage from "./pages/orbit/UsuariosEmpresaPage";
import TarefasPage from "./pages/orbit/TarefasPage";
import OnboardingPage from "./pages/orbit/OnboardingPage";
import ClientOnboardingPage from "./pages/public/ClientOnboardingPage";
import NovaCampanhaPage from "./pages/orbit/NovaCampanhaPage";

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
import AdvisorScanStatusPage from "./pages/pe-admin/AdvisorScanStatusPage";
import ZapiGoLivePage from "./pages/pe-admin/ZapiGoLivePage";

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

function DefaultFunilRedirect() {
  const { user, loading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    async function resolveTarget() {
      try {
        const [{ data: memberships }, { data: roles }, { data: profile }] = await Promise.all([
          supabase.rpc("get_my_empresas" as any),
          supabase.from("user_roles").select("role").eq("user_id", user!.id),
          supabase.from("profiles").select("empresa_id").eq("id", user!.id).maybeSingle(),
        ]);

        const empresas = ((memberships as any[]) || []) as Array<{ empresa_id: string; slug: string | null; is_active?: boolean }>;
        const active = empresas.find((e) => e.empresa_id === profile?.empresa_id) || empresas.find((e) => e.is_active) || empresas[0];

        if (active?.slug) {
          if (mounted) setTarget(`/${active.slug}/funil`);
          return;
        }

        const isSuperAdmin = ((roles as any[]) || []).some((r) => r.role === "super_admin");
        if (mounted) setTarget(isSuperAdmin ? "/pe-admin" : "/select-empresa");
      } catch {
        if (mounted) setTarget("/select-empresa");
      }
    }

    resolveTarget();
    return () => {
      mounted = false;
    };
  }, [user]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (!target) return <LoadingScreen />;
  return <Navigate to={target} replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
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
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

// Nested orbit routes (each page wraps itself with OrbitLayout)
function OrbitRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="funil" replace />} />
      <Route path="dashboard" element={<OrbitDashboard />} />
      <Route path="prospects" element={<ProspectsPage />} />
      <Route path="prospects/:id" element={<ProspectsPage />} />
      <Route path="conversas" element={<ConversasPage />} />
      <Route path="omnichannel" element={<OmnichannelInboxPage />} />
      <Route path="funil" element={<FunilPage />} />
      <Route path="campanhas" element={<CampanhasPage />} />
      <Route path="campanhas/nova" element={<NovaCampanhaPage />} />
      <Route path="campanhas/:id/editar" element={<NovaCampanhaPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="templates/email/new" element={<EmailTemplateEditorPage />} />
      <Route path="templates/email/:id/edit" element={<EmailTemplateEditorPage />} />
      
      <Route path="config" element={<ConfigPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="tarefas" element={<TarefasPage />} />
      <Route path="onboarding" element={<SuperAdminRoute><OnboardingPage /></SuperAdminRoute>} />
      <Route path="meu-plano" element={<MeuPlanoPage />} />
      <Route path="usuarios" element={<UsuariosEmpresaPage />} />
    </Routes>
  );
}

const AppRoutes = () => (
  <Routes>
    {/* Public routes with hotsite header */}
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/documentacao" element={<DocumentacaoPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/accept-invite-pe/:token" element={<AcceptInvitePage />} />
      <Route path="/accept-invite" element={<AcceptInviteSaasPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
    </Route>

    {/* OAuth consent (managed Cloud Auth server) */}
    <Route path="/.lovable/oauth/consent" element={<OAuthConsentPage />} />

    <Route path="/funil" element={<DefaultFunilRedirect />} />

    {/* Empresa selector (post-login, when user belongs to >1 empresa) */}
    <Route path="/select-empresa" element={<ProtectedRoute><SelectEmpresaPage /></ProtectedRoute>} />

    {/* Public onboarding wizard (token-based, no auth) */}
    <Route path="/onboarding-cliente/:token" element={<ClientOnboardingPage />} />

    {/* PE Admin Routes */}
    <Route path="/pe-admin" element={<PeAdminLayout />}>
      <Route index element={<Navigate to="/pe-admin/cadastros" replace />} />
      <Route path="cadastros" element={<CadastrosPage />} />
      <Route path="organizations" element={<Navigate to="/pe-admin/cadastros" replace />} />
      <Route path="organizations/:id/users" element={<PeOrgUsersPage />} />
      <Route path="users" element={<PeGlobalUsersPage />} />
      <Route path="planos" element={<PlanosPage />} />
      <Route path="tenants" element={<TenantMapPage />} />
      <Route path="audit" element={<PeAuditLogPage />} />
      <Route path="advisor-scan" element={<AdvisorScanStatusPage />} />
      <Route path="zapi-go-live" element={<ZapiGoLivePage />} />
      <Route path="documentacao" element={<PeAdminDocPage />} />
      <Route path="*" element={<Navigate to="/pe-admin/cadastros" replace />} />
    </Route>

    {/* Hidden sales presentation (no nav link, noindex) */}
    <Route path="/apresentacao/orbit-2026" element={<ApresentacaoOrbit2026 />} />

    {/* Slug tenant routes (catch-all, must be last) */}
    <Route path="/:slug" element={<TenantLayout />}>
      <Route index element={<Navigate to="funil" replace />} />
      <Route path="*" element={<OrbitRoutes />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="orbit-ui-theme"
    >
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
