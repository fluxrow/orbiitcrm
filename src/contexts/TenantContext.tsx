import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TenantState {
  empresaId: string | null;
  slug: string | null;
  isDemo: boolean;
  basePath: string;
  planCode: string | null;
  saasStatus: string | null;
  stripeStatus: string | null;
  trialEndsAt: string | null;
  isLoading: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  empresaNome: string | null;
  notFound: boolean;
}

const defaultState: TenantState = {
  empresaId: null,
  slug: null,
  isDemo: false,
  basePath: "/demo",
  planCode: null,
  saasStatus: null,
  stripeStatus: null,
  trialEndsAt: null,
  isLoading: true,
  isBlocked: false,
  blockReason: null,
  empresaNome: null,
  notFound: false,
};

const TenantContext = createContext<TenantState>(defaultState);

export function useTenant() {
  return useContext(TenantContext);
}

interface TenantProviderProps {
  children: ReactNode;
  isDemo?: boolean;
}

export function TenantProvider({ children, isDemo = false }: TenantProviderProps) {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [state, setState] = useState<TenantState>({ ...defaultState, isDemo });

  useEffect(() => {
    if (!user) {
      setState(s => ({ ...s, isLoading: false }));
      return;
    }

    if (isDemo) {
      loadDemoTenant();
    } else if (slug) {
      loadSlugTenant(slug);
    }
  }, [user?.id, slug, isDemo]);

  async function loadDemoTenant() {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user!.id)
        .maybeSingle();

      setState({
        empresaId: profile?.empresa_id || null,
        slug: null,
        isDemo: true,
        basePath: "/demo",
        planCode: "demo",
        saasStatus: "active",
        stripeStatus: null,
        trialEndsAt: null,
        isLoading: false,
        isBlocked: false,
        blockReason: null,
        empresaNome: null,
        notFound: false,
      });
    } catch {
      setState(s => ({ ...s, isLoading: false }));
    }
  }

  async function loadSlugTenant(slugParam: string) {
    try {
      const { data, error } = await supabase.rpc("get_empresa_by_slug", {
        p_slug: slugParam,
      });

      if (error || !data) {
        setState(s => ({ ...s, isLoading: false, notFound: true }));
        return;
      }

      const result = data as Record<string, unknown>;
      const empresaId = result.empresa_id as string;

      // Validate user belongs to this empresa: owner via profile, membership, or super admin
      const [{ data: profile }, { data: isSuperAdmin }, { data: membership }] = await Promise.all([
        supabase.from("profiles").select("empresa_id").eq("id", user!.id).maybeSingle(),
        supabase.rpc("pe_is_super_admin", { p_user_id: user!.id }),
        supabase
          .from("user_empresa_memberships")
          .select("empresa_id")
          .eq("user_id", user!.id)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
      ]);

      const belongsToEmpresa =
        profile?.empresa_id === empresaId || !!membership || !!isSuperAdmin;

      if (!belongsToEmpresa) {
        setState(s => ({
          ...s,
          isLoading: false,
          isBlocked: true,
          blockReason: "unauthorized",
          empresaNome: result.nome as string,
        }));
        return;
      }

      // CRITICAL: sync the user's active empresa to match the URL tenant.
      // RLS is driven by profiles.empresa_id via get_user_empresa_id(); without this,
      // a user with access to multiple empresas (e.g. Promotrip + Fluxrow) would see
      // data from their "home" tenant on every other tenant's screens.
      if (profile?.empresa_id !== empresaId) {
        await supabase.rpc("switch_active_empresa", { p_empresa_id: empresaId });
      }

      setState({
        empresaId,
        slug: slugParam,
        isDemo: false,
        basePath: `/${slugParam}`,
        planCode: result.plan_code as string | null,
        saasStatus: result.saas_status as string | null,
        stripeStatus: result.stripe_status as string | null,
        trialEndsAt: result.trial_ends_at as string | null,
        isLoading: false,
        isBlocked: (result.blocked as boolean) || false,
        blockReason: (result.reason as string) || null,
        empresaNome: result.nome as string | null,
        notFound: false,
      });
    } catch {
      setState(s => ({ ...s, isLoading: false, notFound: true }));
    }
  }

  return (
    <TenantContext.Provider value={state}>
      {children}
    </TenantContext.Provider>
  );
}
