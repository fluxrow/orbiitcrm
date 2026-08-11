-- Regra de corte de automação por tenant.
-- A coluna já existe em produção (hotfix aplicado manualmente); a migration é
-- idempotente para manter ambientes novos/remixes equivalentes.
--
-- Semântica: quando NULL, o comportamento do tenant não muda (automação livre).
-- Quando preenchida, somente prospects com created_at >= valor podem receber
-- resposta automática da IA e novas cadências (D0/D+1/D+3).

ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS auto_reply_new_leads_from timestamptz;

COMMENT ON COLUMN public.orbit_ai_config.auto_reply_new_leads_from IS
  'Corte de automacao por tenant: apenas prospects com created_at >= este instante recebem IA automatica e novas cadencias. NULL = sem corte (comportamento anterior).';