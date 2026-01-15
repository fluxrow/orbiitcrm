import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";

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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Redirect root to Orbit dashboard */}
          <Route path="/" element={<Navigate to="/orbit" replace />} />
          
          {/* Orbit CRM Routes */}
          <Route path="/orbit" element={<OrbitDashboard />} />
          <Route path="/orbit/prospects" element={<ProspectsPage />} />
          <Route path="/orbit/conversas" element={<ConversasPage />} />
          <Route path="/orbit/funil" element={<FunilPage />} />
          <Route path="/orbit/campanhas" element={<CampanhasPage />} />
          <Route path="/orbit/templates" element={<TemplatesPage />} />
          <Route path="/orbit/lead-finder" element={<LeadFinderPage />} />
          <Route path="/orbit/config" element={<ConfigPage />} />
          <Route path="/orbit/analytics" element={<AnalyticsPage />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
