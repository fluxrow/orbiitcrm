
ALTER TABLE public.orbit_flow_templates
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orbit_flow_templates_official
  ON public.orbit_flow_templates(is_official) WHERE is_official = true;

INSERT INTO public.orbit_flow_templates (nome, descricao, categoria, definicao, is_global, ativo, is_official)
VALUES (
  '[CORE] Orbit Core Flow',
  'Espinha dorsal universal: ingestão de lead → tag de origem → qualificação IA → deal + notificação OU nurturing/downsell → follow-up cadenciado → handoff. Customize apenas os templates de mensagem [CORE] e o prompt de identidade da IA.',
  'Core',
  '{
    "trigger_type": "lead_recebido",
    "trigger_config": {},
    "condicoes": {},
    "actions": [
      {
        "action_type": "switch",
        "delay_seconds": 0,
        "action_config": {
          "field": "prospect.origem",
          "cases": [
            { "id": "c_ads", "label": "Instagram/Meta Ads", "match": { "op": "in", "value": "instagram,meta,facebook,ads" }, "actions": [] },
            { "id": "c_site", "label": "Site / Typebot", "match": { "op": "in", "value": "site,typebot,landing,form" }, "actions": [] }
          ],
          "default": { "actions": [] }
        }
      },
      {
        "action_type": "toggle_ai_agent",
        "delay_seconds": 0,
        "action_config": { "human_talk": false, "prompt_slug": "CORE_QUALIFICACAO_INICIAL" }
      },
      {
        "action_type": "if_else",
        "delay_seconds": 0,
        "action_config": {
          "condition": { "logic": "AND", "children": [
            { "field": "prospect.qualificado", "op": "equals", "value": "true" }
          ]},
          "then": [
            { "action_type": "create_task", "delay_seconds": 0, "action_config": { "titulo": "Novo lead qualificado — abrir deal", "prazo_dias": 1 } },
            { "action_type": "notify_vendedor", "delay_seconds": 0, "action_config": { "canal": "whatsapp", "para": "admin", "template_slug": "[CORE] Novo Deal Qualificado" } }
          ],
          "else": [
            {
              "action_type": "if_else",
              "delay_seconds": 0,
              "action_config": {
                "condition": { "logic": "AND", "children": [
                  { "field": "prospect.renda_baixa", "op": "equals", "value": "true" }
                ]},
                "then": [
                  { "action_type": "send_whatsapp_template", "delay_seconds": 0, "action_config": { "template_slug": "[CORE] OFFER_LOW_TICKET" } }
                ],
                "else": [
                  { "action_type": "send_whatsapp_template", "delay_seconds": 0, "action_config": { "template_slug": "[CORE] NURTURING_GENERICO" } }
                ]
              }
            }
          ]
        }
      },
      {
        "action_type": "delay_execution",
        "delay_seconds": 0,
        "action_config": { "wait_value": 3, "wait_unit": "hours" }
      },
      {
        "action_type": "toggle_ai_agent",
        "delay_seconds": 0,
        "action_config": { "human_talk": false, "prompt_slug": "CORE_FOLLOWUP" }
      },
      {
        "action_type": "switch",
        "delay_seconds": 0,
        "action_config": {
          "field": "conversa.status",
          "cases": [
            { "id": "aberta", "label": "Conversa aberta", "match": { "op": "equals", "value": "aberta" },
              "actions": [
                { "action_type": "delay_execution", "delay_seconds": 0, "action_config": { "wait_value": 24, "wait_unit": "hours" } }
              ]
            },
            { "id": "encerrada", "label": "Conversa encerrada", "match": { "op": "equals", "value": "encerrada" }, "actions": [] }
          ],
          "default": { "actions": [] }
        }
      },
      {
        "action_type": "if_else",
        "delay_seconds": 0,
        "action_config": {
          "condition": { "logic": "AND", "children": [
            { "field": "conversa.status", "op": "equals", "value": "handoff" }
          ]},
          "then": [
            { "action_type": "notify_vendedor", "delay_seconds": 0, "action_config": { "canal": "whatsapp", "para": "responsavel", "template_slug": "[CORE] Handoff Ouro" } },
            { "action_type": "create_task", "delay_seconds": 0, "action_config": { "titulo": "Retomar handoff — cliente aguardando", "prazo_dias": 0 } }
          ],
          "else": []
        }
      }
    ]
  }'::jsonb,
  true, true, true
)
ON CONFLICT (nome) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  definicao = EXCLUDED.definicao,
  is_official = true,
  is_global = true,
  ativo = true,
  updated_at = now();
