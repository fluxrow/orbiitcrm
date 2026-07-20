
ALTER TABLE public.orbit_flow_scheduled_actions
  ADD COLUMN IF NOT EXISTS cadence_key TEXT NULL;

-- Índice único parcial: apenas uma cadência ativa por chave (pending/running).
CREATE UNIQUE INDEX IF NOT EXISTS orbit_flow_scheduled_actions_cadence_active_uidx
  ON public.orbit_flow_scheduled_actions (cadence_key)
  WHERE cadence_key IS NOT NULL AND status IN ('pending', 'running');

COMMENT ON COLUMN public.orbit_flow_scheduled_actions.cadence_key IS
  'Chave lógica de cadência ativa para send_whatsapp_template: empresa+prospect+flow+action. Nulo quando qualquer componente falta (fail-safe). Índice parcial garante uma única cadência ativa (pending/running) por chave — success/canceled/failed liberam a chave para reuso.';
