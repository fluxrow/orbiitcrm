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

// Super Admin Pages
import SuperAdminDashboard from "./pages/super-admin/SuperAdminDashboard";
import EmpresasPage from "./pages/super-admin/EmpresasPage";
import UsuariosGlobaisPage from "./pages/super-admin/UsuariosGlobaisPage";

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
    
    {/* Super Admin Routes */}
    <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute>} />
    <Route path="/super-admin/empresas" element={<SuperAdminRoute><EmpresasPage /></SuperAdminRoute>} />
    <Route path="/super-admin/usuarios" element={<SuperAdminRoute><UsuariosGlobaisPage /></SuperAdminRoute>} />
    
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
