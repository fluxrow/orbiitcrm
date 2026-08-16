insert into public.orbit_quarantine_backups (empresa_id, batch_label, entity_type, entity_id, snapshot)
select empresa_id, 'bullink-debounce-recovery-20260816', 'orbit_ai_config.ai_reply_debounce', id, ai_reply_debounce
from public.orbit_ai_config where empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';

update public.orbit_ai_config
set ai_reply_debounce = jsonb_set(coalesce(ai_reply_debounce, '{}'::jsonb), '{recovery_grace_ms}', '0'::jsonb, true),
    updated_at = now()
where empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';