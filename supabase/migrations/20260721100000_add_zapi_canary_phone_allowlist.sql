alter table public.orbit_zapi_config
  add column if not exists canary_phone_numbers text[] not null default '{}';

comment on column public.orbit_zapi_config.canary_phone_numbers is
  'Telefones autorizados para respostas do agente durante canario, mesmo com envio_real_liberado=false. Nao libera campanhas ou follow-ups.';

update public.orbit_zapi_config
set canary_phone_numbers = array['5541992361868', '554192361868'],
    updated_at = now()
where empresa_id = 'fa0ac793-5c5a-43c6-b4c2-eacc276d0d67';
