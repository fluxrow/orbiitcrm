-- Bullink only: remove the robotic self-introduction from the D0 template.
-- The tenant's generative guard does not cover flow_initial templates.
insert into public.orbit_quarantine_backups (
  empresa_id,
  batch_label,
  entity_type,
  entity_id,
  snapshot
)
select
  t.empresa_id,
  'bullink-self-intro-downsell-2026-08-24',
  'orbit_message_template',
  t.id,
  to_jsonb(t)
from public.orbit_message_templates t
where t.id = 'a3275b1f-3689-47fa-a39a-a8444f09bd09'
  and t.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  and not exists (
    select 1
    from public.orbit_quarantine_backups b
    where b.batch_label = 'bullink-self-intro-downsell-2026-08-24'
      and b.entity_type = 'orbit_message_template'
      and b.entity_id = t.id
  );

update public.orbit_message_templates
set
  corpo_texto = 'Oi, {{nome}}. Vi suas respostas e quero entender melhor o que você busca construir no YouTube. Qual é o principal resultado que você quer alcançar agora?',
  updated_at = now()
where id = 'a3275b1f-3689-47fa-a39a-a8444f09bd09'
  and empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';
