-- Fábrica de Pesquisadores: desativa a action imediata de envio de template
-- "Confirmação de Reunião" do flow "Agendado -> Confirmação" (b0c43774).
-- Motivo: o orbit-ai-agent já confirma data/hora/link Meet no chat quando cria
-- o meeting; manter esta action geraria uma segunda mensagem redundante assim
-- que o adapter da Fábrica for ligado. A action irmã create_task (9cea8472) é
-- preservada intacta.
--
-- Guardas: filtra por id da action, id do flow e empresa_id do flow (via join)
-- para evitar mudar qualquer outro registro por engano. Preserva chaves
-- existentes do action_config (dry_run, template_id, category, cancel_on_reply)
-- via jsonb ||.

UPDATE public.orbit_flow_actions AS a
SET action_config = COALESCE(a.action_config, '{}'::jsonb) || jsonb_build_object(
      'enabled', false,
      'disabled_at', now(),
      'disabled_reason', 'redundant_with_ai_agent_confirmation'
    )
FROM public.orbit_flows AS f
WHERE a.id = 'a0a98318-0b7f-41bc-8755-09dde228d2ba'
  AND a.flow_id = 'b0c43774-dc8d-45f1-8d23-f9e2667bd5fc'
  AND a.action_type = 'send_whatsapp_template'
  AND a.flow_id = f.id
  AND f.empresa_id = 'fa0ac793-5c5a-43c6-b4c2-eacc276d0d67';