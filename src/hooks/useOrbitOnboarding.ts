import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

export const TENANT_ONBOARDING_CONTEXT_WAVE4_FLAG =
  "tenant_onboarding_context_wave4_v1" as const;

type OnboardingScopedSection = "list" | "assets" | "insights" | "draft";

async function usesScopedOnboarding(
  _empresaId?: string | null,
  tenantSlug?: string | null,
) {
  if (!tenantSlug) return false;
  const { data, error } = await supabase.rpc(
    "orbit_tenant_onboarding_context_mode" as any,
    { p_tenant_slug: tenantSlug } as any,
  );
  // Deploy order is intentionally code-first. Until the additive migration is
  // present, PostgREST may report a missing function/schema-cache entry. Only
  // that condition falls back; authorization and tenant errors fail closed.
  if (error && ["42883", "PGRST202"].includes(error.code ?? "")) return false;
  if (error) throw error;
  return (data as any)?.enabled === true;
}

async function readTenantOnboardingScoped<T>(
  tenantSlug: string,
  section: OnboardingScopedSection,
  entityId?: string | null,
) {
  const { data, error } = await supabase.rpc(
    "orbit_tenant_onboarding_read_scoped" as any,
    {
      p_tenant_slug: tenantSlug,
      p_section: section,
      p_entity_id: entityId ?? null,
    } as any,
  );
  if (error) throw error;
  return ((data as any)?.data ?? (section === "draft" ? null : [])) as T;
}

async function mutateTenantOnboardingScoped(
  tenantSlug: string,
  actionType: string,
  onboardingId: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc(
    "orbit_tenant_onboarding_mutate_scoped" as any,
    {
      p_tenant_slug: tenantSlug,
      p_action_type: actionType,
      p_onboarding_id: onboardingId,
      p_payload: payload,
    } as any,
  );
  if (error) throw error;
  return data;
}

export type OnboardingStatus =
  | "rascunho" | "enviado" | "em_andamento" | "concluido" | "revisado" | "arquivado";

export interface ClientOnboarding {
  id: string;
  empresa_id: string;
  public_token: string;
  status: OnboardingStatus;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_empresa: string | null;
  responses: Record<string, any>;
  implementation_checklist: any[];
  notes: string | null;
  sent_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_saved_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  empresa?: { nome: string | null; slug: string | null } | null;
}

export function useClientOnboardings() {
  const { empresaId, slug } = useTenant();
  const { hasRole: isSuper } = useIsSuperAdmin();
  return useQuery({
    queryKey: ["client-onboardings", empresaId, isSuper],
    enabled: !!empresaId,
    queryFn: async () => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        return readTenantOnboardingScoped<ClientOnboarding[]>(slug!, "list");
      }
      let q = supabase
        .from("orbit_client_onboardings" as any)
        .select("*")
        .order("created_at", { ascending: false });
      // Super admin sees onboardings of all tenants (centralized view from Fluxrow).
      // Regular users only see their own tenant's onboardings.
      if (!isSuper) q = q.eq("empresa_id", empresaId!);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const empresaIds = Array.from(new Set(rows.map((r) => r.empresa_id).filter(Boolean)));
      let empresasMap: Record<string, { nome: string | null; slug: string | null }> = {};
      if (empresaIds.length > 0) {
        const { data: emps } = await supabase
          .from("orbit_empresas")
          .select("id, nome, slug")
          .in("id", empresaIds);
        for (const e of emps ?? []) empresasMap[e.id] = { nome: e.nome, slug: e.slug };
      }
      return rows.map((r) => ({ ...r, empresa: empresasMap[r.empresa_id] ?? null })) as unknown as ClientOnboarding[];
    },

  });
}

export function useCreateOnboarding() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (input: {
      // New-tenant flow (preferred for paying clients)
      empresa_nome?: string;
      slug?: string;
      monthly_price_cents?: number;
      setup_fee_cents?: number;
      // Onboarding contact data
      cliente_nome: string;
      cliente_email: string;
      cliente_empresa?: string;
      notes?: string;
      // Optional: target an existing empresa instead of creating a new one
      empresa_id?: string;
      // Smoke/dry-run: cria o onboarding mas não envia email pelo Resend
      dry_run_email?: boolean;
    }) => {
      const payload: Record<string, unknown> = { ...input };
      // If neither new-tenant name nor explicit empresa_id was provided, fall back to current tenant
      if (!input.empresa_nome && !input.empresa_id) {
        if (!empresaId) throw new Error("empresa_id ausente");
        payload.empresa_id = empresaId;
      }
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-create", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao criar onboarding");
      return data.data as {
        id: string;
        public_token: string;
        public_link: string;
        empresa_id: string;
        empresa_nome: string;
        empresa_slug: string;
        email_sent: boolean;
        email_skipped_reason?: string;
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

export function useArchiveOnboarding() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        await mutateTenantOnboardingScoped(slug!, "archive_onboarding", id);
        return;
      }
      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ archived: true, status: "arquivado" })
        .eq("id", id)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({ id, checklist }: { id: string; checklist: any[] }) => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        await mutateTenantOnboardingScoped(slug!, "update_checklist", id, { checklist });
        return;
      }
      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ implementation_checklist: checklist })
        .eq("id", id)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

export function useUpdateOnboardingResponses() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({ id, responses }: { id: string; responses: Record<string, any> }) => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        await mutateTenantOnboardingScoped(slug!, "update_responses", id, { responses });
        return;
      }
      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ responses })
        .eq("id", id)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

// ── Public (token-based) ──

export function usePublicOnboarding(token: string | undefined) {
  return useQuery({
    queryKey: ["public-onboarding", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_onboarding_by_token" as any, { p_token: token! });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || "not_found");
      return res.data as {
        id: string;
        status: OnboardingStatus;
        cliente_nome: string | null;
        cliente_email: string | null;
        cliente_empresa: string | null;
        responses: Record<string, any>;
        sent_at: string | null;
        completed_at: string | null;
        last_saved_at: string | null;
        empresa_nome: string | null;
      };
    },
  });
}

export function useSavePublicOnboarding() {
  return useMutation({
    mutationFn: async ({ token, responses }: { token: string; responses: Record<string, any> }) => {
      const { data, error } = await supabase.rpc("save_onboarding_responses" as any, {
        p_token: token, p_responses: responses,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || "save_failed");
      return res.data;
    },
  });
}

// ── Fase 3: Processamento inteligente de materiais ──

export interface OnboardingAssetInsight {
  id: string;
  asset_id: string;
  onboarding_id: string;
  detected_kind: string | null;
  summary: string | null;
  extracted: any;
  error: string | null;
  model: string | null;
  review_status: "pending" | "approved" | "ignored";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingImplementationDraft {
  id: string;
  onboarding_id: string;
  empresa_id: string;
  status: "draft" | "reviewed" | "discarded";
  draft: {
    flows?: any[];
    templates?: any[];
    cadences?: any[];
    knowledge?: any[];
    lead_score?: Record<string, any>;
    notes?: string;
  };
  summary_markdown: string | null;
  assets_considered: number;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingAsset {
  id: string;
  empresa_id: string;
  onboarding_id: string;
  section_key: string;
  field_key: string;
  item_id: string | null;
  storage_path: string;
  filename: string;
  mime: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useOnboardingAssets(onboardingId: string | undefined) {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["onboarding-assets", empresaId, slug, onboardingId],
    enabled: !!empresaId && !!onboardingId,
    queryFn: async () => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        return readTenantOnboardingScoped<OnboardingAsset[]>(slug!, "assets", onboardingId!);
      }
      const { data, error } = await supabase
        .from("orbit_onboarding_assets" as any)
        .select("*")
        .eq("onboarding_id", onboardingId!)
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingAsset[];
    },
  });
}

export function useOnboardingInsights(onboardingId: string | undefined) {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["onboarding-insights", empresaId, slug, onboardingId],
    enabled: !!empresaId && !!onboardingId,
    queryFn: async () => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        return readTenantOnboardingScoped<OnboardingAssetInsight[]>(slug!, "insights", onboardingId!);
      }
      const { data, error } = await supabase
        .from("orbit_onboarding_asset_insights" as any)
        .select("*")
        .eq("onboarding_id", onboardingId!)
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingAssetInsight[];
    },
  });
}

export function useOnboardingDraft(onboardingId: string | undefined) {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["onboarding-draft", empresaId, slug, onboardingId],
    enabled: !!empresaId && !!onboardingId,
    queryFn: async () => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        return readTenantOnboardingScoped<OnboardingImplementationDraft | null>(
          slug!, "draft", onboardingId!,
        );
      }
      const { data, error } = await supabase
        .from("orbit_onboarding_implementation_drafts" as any)
        .select("*")
        .eq("onboarding_id", onboardingId!)
        .eq("empresa_id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as OnboardingImplementationDraft | null;
    },
  });
}

export function useProcessOnboardingAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: string | { onboardingId: string; assetId?: string },
    ) => {
      const onboardingId = typeof input === "string" ? input : input.onboardingId;
      const assetId = typeof input === "string" ? undefined : input.assetId;
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-process-assets", {
        body: { onboarding_id: onboardingId, asset_id: assetId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao processar materiais");
      return data.data as {
        onboarding_id: string;
        assets_processed: number;
        insights: any[];
        draft_status: string;
        tokens_in: number;
        tokens_out: number;
        ai_enabled: boolean;
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["onboarding-assets"] });
      qc.invalidateQueries({ queryKey: ["onboarding-insights"] });
      qc.invalidateQueries({ queryKey: ["onboarding-draft"] });
      qc.invalidateQueries({ queryKey: ["client-onboardings"] });
    },
  });
}

export function useReviewInsight() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({
      insightId,
      onboardingId,
      status,
    }: {
      insightId: string;
      onboardingId: string;
      status: "pending" | "approved" | "ignored";
    }) => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        const data = await mutateTenantOnboardingScoped(
          slug!, "review_insight", onboardingId, { insight_id: insightId, status },
        );
        return { data, onboardingId };
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("orbit_onboarding_asset_insights" as any)
        .update({
          review_status: status,
          reviewed_by: userRes.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", insightId)
        .eq("empresa_id", empresaId!)
        .select()
        .maybeSingle();
      if (error) throw error;
      return { data, onboardingId };
    },
    onSuccess: ({ onboardingId }) => {
      qc.invalidateQueries({ queryKey: ["onboarding-insights"] });
    },
  });
}

/**
 * Reconciliação de asset órfão: o arquivo existe no Storage/tabela de assets,
 * mas o item correspondente no formulário ficou sem asset_id (ou preso em
 * "uploading"). Religa os dois pelo item_id do asset, sem inventar conteúdo.
 */
export function useReconcileOrphanAsset() {
  const qc = useQueryClient();
  const { empresaId, slug } = useTenant();
  return useMutation({
    mutationFn: async ({
      onboardingId,
      asset,
    }: {
      onboardingId: string;
      asset: OnboardingAsset;
    }) => {
      if (await usesScopedOnboarding(empresaId, slug)) {
        await mutateTenantOnboardingScoped(
          slug!, "reconcile_asset_reference", onboardingId, { asset_id: asset.id },
        );
        return { onboardingId };
      }
      const { data: ob, error: obErr } = await supabase
        .from("orbit_client_onboardings" as any)
        .select("id, responses")
        .eq("id", onboardingId)
        .eq("empresa_id", empresaId!)
        .maybeSingle();
      if (obErr) throw obErr;
      const responses: any = (ob as any)?.responses ?? {};
      const list = responses?.[asset.section_key]?.[asset.field_key];
      if (!Array.isArray(list)) throw new Error("Campo do formulário não encontrado para este material.");

      const patch = {
        asset_id: asset.id,
        storage_path: asset.storage_path,
        filename: asset.filename,
        mime: asset.mime,
        size_bytes: asset.size_bytes,
        upload_status: "uploaded",
      };

      let matched = false;
      let nextList = list.map((it: any) => {
        if (it && typeof it === "object" && asset.item_id && it.id === asset.item_id) {
          matched = true;
          return { ...it, ...patch, titulo: it.titulo || asset.filename };
        }
        return it;
      });
      if (!matched) {
        nextList = [
          ...nextList,
          { id: asset.item_id ?? asset.id, tipo: "Outro", titulo: asset.filename, link: "", obs: "", ...patch },
        ];
      }

      const nextResponses = {
        ...responses,
        [asset.section_key]: { ...(responses?.[asset.section_key] ?? {}), [asset.field_key]: nextList },
      };

      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ responses: nextResponses })
        .eq("id", onboardingId)
        .eq("empresa_id", empresaId!);
      if (error) throw error;
      return { onboardingId };
    },
    onSuccess: ({ onboardingId }) => {
      qc.invalidateQueries({ queryKey: ["client-onboardings"] });
      qc.invalidateQueries({ queryKey: ["onboarding-assets"] });
    },
  });
}

export function useSubmitPublicOnboarding() {
  return useMutation({
    mutationFn: async ({ token, responses }: { token: string; responses: Record<string, any> }) => {
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-submit", {
        body: { token, responses },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao enviar");
      return data.data;
    },
  });
}
