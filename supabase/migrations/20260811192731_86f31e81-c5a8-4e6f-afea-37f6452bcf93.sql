ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS notification_recipient_whatsapp text;

COMMENT ON COLUMN public.orbit_ai_config.notification_recipient_whatsapp IS
  'Telefone (digitos E.164) que recebe notificacoes internas de WhatsApp do tenant (venda confirmada, lead qualificado, handoff). Quando nulo, usa scheduling_handoff_whatsapp. NUNCA usar canary_phone_numbers como destinatario.';