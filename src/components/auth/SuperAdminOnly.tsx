import { ReactNode } from "react";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renderiza children APENAS para usuários com role super_admin (Master Tenant / Fluxrow).
 * Use para isolar ferramentas internas do SaaS (onboarding, painéis admin, logs globais)
 * da interface das empresas clientes.
 */
export function SuperAdminOnly({ children, fallback = null }: Props) {
  const { hasRole, isLoading } = useIsSuperAdmin();
  if (isLoading || !hasRole) return <>{fallback}</>;
  return <>{children}</>;
}
