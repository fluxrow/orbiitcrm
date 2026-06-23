DO $$
DECLARE
  v_keep uuid := '0d6ae9ad-2e08-48b3-aa59-c28e5e341390';
  v_drop uuid := '21e08cb2-a3b1-4854-8563-21785f80c70a';
BEGIN
  UPDATE public.orbit_mensagens SET conversa_id = v_keep WHERE conversa_id = v_drop;
  UPDATE public.orbit_conversas SET telefone_whatsapp = '5541997830472' WHERE id = v_keep;
  UPDATE public.orbit_conversas
     SET status = 'fechada',
         ai_contexto = COALESCE(ai_contexto, '{}'::jsonb) || jsonb_build_object('merged_into', v_keep::text)
   WHERE id = v_drop;
END $$;