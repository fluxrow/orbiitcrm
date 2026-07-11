
-- =========================================================
-- Fase 3: Processamento inteligente de materiais do onboarding
-- =========================================================

CREATE TABLE IF NOT EXISTS public.orbit_onboarding_asset_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.orbit_client_onboardings(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.orbit_onboarding_assets(id) ON DELETE CASCADE,
  detected_kind TEXT,           -- ex: 'typebot_flow' | 'conversation_transcript' | 'faq' | 'presentation' | 'unknown'
  summary TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  tokens_in INTEGER,
  tokens_out INTEGER,
  model TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id)
);

GRANT SELECT ON public.orbit_onboarding_asset_insights TO authenticated;
GRANT ALL ON public.orbit_onboarding_asset_insights TO service_role;

ALTER TABLE public.orbit_onboarding_asset_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own asset insights"
ON public.orbit_onboarding_asset_insights
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_asset_insights.empresa_id
  )
);

CREATE TRIGGER trg_orbit_onboarding_asset_insights_updated
BEFORE UPDATE ON public.orbit_onboarding_asset_insights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_asset_insights_onboarding
  ON public.orbit_onboarding_asset_insights(onboarding_id);

-- =========================================================

CREATE TABLE IF NOT EXISTS public.orbit_onboarding_implementation_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  onboarding_id UUID NOT NULL REFERENCES public.orbit_client_onboardings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'reviewed' | 'discarded'
  draft JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { flows: [], templates: [], cadences: [], knowledge: [], lead_score: {}, notes: '' }
  summary_markdown TEXT,
  assets_considered INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (onboarding_id)
);

GRANT SELECT, UPDATE ON public.orbit_onboarding_implementation_drafts TO authenticated;
GRANT ALL ON public.orbit_onboarding_implementation_drafts TO service_role;

ALTER TABLE public.orbit_onboarding_implementation_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read own drafts"
ON public.orbit_onboarding_implementation_drafts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_implementation_drafts.empresa_id
  )
);

CREATE POLICY "Tenant members update own drafts status"
ON public.orbit_onboarding_implementation_drafts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_implementation_drafts.empresa_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_implementation_drafts.empresa_id
  )
);

CREATE TRIGGER trg_orbit_onboarding_impl_drafts_updated
BEFORE UPDATE ON public.orbit_onboarding_implementation_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_impl_drafts_onboarding
  ON public.orbit_onboarding_implementation_drafts(onboarding_id);
