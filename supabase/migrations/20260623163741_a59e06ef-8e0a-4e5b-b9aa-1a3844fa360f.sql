
CREATE TABLE public.orbit_chatbot_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  descricao       TEXT,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  trigger_modo    TEXT DEFAULT 'contains' CHECK (trigger_modo IN ('contains', 'exact')),
  passo1_texto    TEXT,
  passo1_audio_id UUID REFERENCES public.orbit_audio_library(id) ON DELETE SET NULL,
  passo1_aguardar_resposta BOOLEAN DEFAULT true,
  ativo           BOOLEAN DEFAULT true,
  prioridade      INTEGER DEFAULT 0,
  uso_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_chatbot_flows TO authenticated;
GRANT ALL ON public.orbit_chatbot_flows TO service_role;

ALTER TABLE public.orbit_chatbot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa manages chatbot flows"
  ON public.orbit_chatbot_flows FOR ALL
  TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()))
  WITH CHECK (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE TABLE public.orbit_chatbot_flow_branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         UUID NOT NULL REFERENCES public.orbit_chatbot_flows(id) ON DELETE CASCADE,
  nome            TEXT,
  keywords        TEXT[],
  resposta_texto  TEXT,
  resposta_audio_id UUID REFERENCES public.orbit_audio_library(id) ON DELETE SET NULL,
  encerrar_fluxo  BOOLEAN DEFAULT true,
  ordem           INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_chatbot_flow_branches TO authenticated;
GRANT ALL ON public.orbit_chatbot_flow_branches TO service_role;

ALTER TABLE public.orbit_chatbot_flow_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa manages chatbot branches"
  ON public.orbit_chatbot_flow_branches FOR ALL
  TO authenticated
  USING (flow_id IN (
    SELECT id FROM public.orbit_chatbot_flows
    WHERE empresa_id = public.get_user_empresa_id(auth.uid())
  ))
  WITH CHECK (flow_id IN (
    SELECT id FROM public.orbit_chatbot_flows
    WHERE empresa_id = public.get_user_empresa_id(auth.uid())
  ));

ALTER TABLE public.orbit_conversas
  ADD COLUMN IF NOT EXISTS chatbot_flow_id UUID REFERENCES public.orbit_chatbot_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chatbot_aguardando BOOLEAN DEFAULT false;

CREATE INDEX idx_chatbot_flows_empresa ON public.orbit_chatbot_flows(empresa_id) WHERE ativo = true;
CREATE INDEX idx_chatbot_branches_flow ON public.orbit_chatbot_flow_branches(flow_id);

CREATE TRIGGER update_orbit_chatbot_flows_updated_at
  BEFORE UPDATE ON public.orbit_chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
