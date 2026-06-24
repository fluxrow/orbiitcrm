import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import TenantNotFound from "./TenantNotFound";
import TenantBlocked from "./TenantBlocked";

function TenantContent() {
  const { user, loading: authLoading } = useAuth();
  const tenant = useTenant();

  // While auth is loading, show spinner
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // If not logged in, redirect to auth
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // User is logged in, wait for tenant to load
  if (tenant.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (tenant.notFound) {
    return <TenantNotFound />;
  }

  if (tenant.isBlocked) {
    return (
      <TenantBlocked
        reason={tenant.blockReason}
        trialEndsAt={tenant.trialEndsAt}
        empresaNome={tenant.empresaNome}
        empresaId={tenant.empresaId}
        basePath={tenant.basePath}
      />
    );
  }

  return <Outlet />;
}

export default function TenantLayout() {
  return (
    <TenantProvider>
      <TenantContent />
    </TenantProvider>
  );
}
