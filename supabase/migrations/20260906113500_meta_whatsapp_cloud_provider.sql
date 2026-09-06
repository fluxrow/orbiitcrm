-- Official Meta WhatsApp Cloud API provider.
--
-- Credentials are never stored in public columns: access token and app secret
-- live in Supabase Vault and are only exposed through service_role-only RPCs.
-- Activation is fail-closed and proactive traffic is disabled by default so a
-- provider switch cannot flush an existing campaign/flow backlog.

begin;

create table if not exists public.orbit_meta_whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  waba_id text,
  phone_number_id text,
  graph_api_version text not null default 'v25.0',
  webhook_verify_token text not null default encode(gen_random_bytes(24), 'hex'),
  access_token_secret_id uuid,
  app_secret_secret_id uuid,
  ativo boolean not null default false,
  envio_real_liberado boolean not null default false,
  canary_mode_enabled boolean not null default true,
  canary_phone_numbers text[] not null default '{}',
  allow_proactive_messages boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_meta_whatsapp_config_empresa_unique unique (empresa_id),
  constraint orbit_meta_whatsapp_graph_version_chk
    check (graph_api_version ~ '^v[0-9]+[.][0-9]+$')
);

create unique index if not exists orbit_meta_whatsapp_phone_number_unique
  on public.orbit_meta_whatsapp_config (phone_number_id)
  where phone_number_id is not null and btrim(phone_number_id) <> '';

alter table public.orbit_meta_whatsapp_config enable row level security;
revoke all privileges on table public.orbit_meta_whatsapp_config
  from public, anon, authenticated;

drop trigger if exists update_orbit_meta_whatsapp_config_updated_at
  on public.orbit_meta_whatsapp_config;
create trigger update_orbit_meta_whatsapp_config_updated_at
before update on public.orbit_meta_whatsapp_config
for each row execute function public.update_updated_at_column();

create or replace function public._build_orbit_meta_whatsapp_public_response(
  p_config_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id,
    'empresa_id', c.empresa_id,
    'waba_id', c.waba_id,
    'phone_number_id', c.phone_number_id,
    'graph_api_version', c.graph_api_version,
    'webhook_verify_token', c.webhook_verify_token,
    'has_access_token', c.access_token_secret_id is not null,
    'has_app_secret', c.app_secret_secret_id is not null,
    'ativo', c.ativo,
    'envio_real_liberado', c.envio_real_liberado,
    'canary_mode_enabled', c.canary_mode_enabled,
    'canary_phone_numbers', c.canary_phone_numbers,
    'allow_proactive_messages', c.allow_proactive_messages,
    'activated_at', c.activated_at,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  ) end
  from public.orbit_meta_whatsapp_config c
  where c.id = p_config_id;
$$;

create or replace function public._build_orbit_meta_whatsapp_runtime_response(
  p_config_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare
  v_config public.orbit_meta_whatsapp_config%rowtype;
  v_access_token text;
  v_app_secret text;
begin
  select * into v_config
  from public.orbit_meta_whatsapp_config
  where id = p_config_id;

  if not found then return null; end if;

  if v_config.access_token_secret_id is not null then
    select decrypted_secret into v_access_token
    from vault.decrypted_secrets
    where id = v_config.access_token_secret_id;
  end if;

  if v_config.app_secret_secret_id is not null then
    select decrypted_secret into v_app_secret
    from vault.decrypted_secrets
    where id = v_config.app_secret_secret_id;
  end if;

  return jsonb_build_object(
    'id', v_config.id,
    'empresa_id', v_config.empresa_id,
    'waba_id', v_config.waba_id,
    'phone_number_id', v_config.phone_number_id,
    'graph_api_version', v_config.graph_api_version,
    'webhook_verify_token', v_config.webhook_verify_token,
    'access_token', v_access_token,
    'app_secret', v_app_secret,
    'ativo', v_config.ativo,
    'envio_real_liberado', v_config.envio_real_liberado,
    'canary_mode_enabled', v_config.canary_mode_enabled,
    'canary_phone_numbers', v_config.canary_phone_numbers,
    'allow_proactive_messages', v_config.allow_proactive_messages,
    'activated_at', v_config.activated_at
  );
end;
$$;

create or replace function public.get_orbit_meta_whatsapp_config_public(
  p_empresa_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_config_id uuid;
begin
  if p_empresa_id is null then raise exception 'empresa_id_required'; end if;
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  if not (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.pe_user_is_orbit_admin(auth.uid())
      and public.get_user_empresa_id(auth.uid()) = p_empresa_id
    )
  ) then
    raise exception 'access_denied';
  end if;

  select id into v_config_id
  from public.orbit_meta_whatsapp_config
  where empresa_id = p_empresa_id;

  return public._build_orbit_meta_whatsapp_public_response(v_config_id);
end;
$$;

create or replace function public.get_orbit_meta_whatsapp_runtime_config(
  p_empresa_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, vault
as $$
  select public._build_orbit_meta_whatsapp_runtime_response(c.id)
  from public.orbit_meta_whatsapp_config c
  where c.empresa_id = p_empresa_id;
$$;

create or replace function public.get_orbit_meta_whatsapp_runtime_config_by_phone_id(
  p_phone_number_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public, vault
as $$
  select public._build_orbit_meta_whatsapp_runtime_response(c.id)
  from public.orbit_meta_whatsapp_config c
  where c.phone_number_id = nullif(btrim(p_phone_number_id), '')
    and c.ativo = true;
$$;

create or replace function public.verify_orbit_meta_whatsapp_webhook_token(
  p_token text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orbit_meta_whatsapp_config c
    where c.webhook_verify_token = nullif(btrim(p_token), '')
  );
$$;

create or replace function public.upsert_orbit_meta_whatsapp_config_secure(
  p_empresa_id uuid,
  p_waba_id text default null,
  p_phone_number_id text default null,
  p_access_token text default null,
  p_app_secret text default null,
  p_graph_api_version text default 'v25.0',
  p_ativo boolean default false,
  p_envio_real_liberado boolean default false,
  p_canary_mode_enabled boolean default true,
  p_canary_phone_numbers text[] default '{}',
  p_allow_proactive_messages boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_config public.orbit_meta_whatsapp_config%rowtype;
  v_access_token_secret_id uuid;
  v_app_secret_secret_id uuid;
  v_name text;
  v_was_active boolean := false;
begin
  if p_empresa_id is null then raise exception 'empresa_id_required'; end if;
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  if not (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      public.pe_user_is_orbit_admin(auth.uid())
      and public.get_user_empresa_id(auth.uid()) = p_empresa_id
    )
  ) then
    raise exception 'access_denied';
  end if;

  if coalesce(p_graph_api_version, '') !~ '^v[0-9]+[.][0-9]+$' then
    raise exception 'invalid_graph_api_version';
  end if;

  select * into v_config
  from public.orbit_meta_whatsapp_config
  where empresa_id = p_empresa_id
  for update;

  if found then v_was_active := v_config.ativo; end if;

  if not found then
    insert into public.orbit_meta_whatsapp_config (
      empresa_id, waba_id, phone_number_id, graph_api_version, ativo,
      envio_real_liberado, canary_mode_enabled, canary_phone_numbers,
      allow_proactive_messages
    ) values (
      p_empresa_id,
      nullif(btrim(p_waba_id), ''),
      nullif(btrim(p_phone_number_id), ''),
      p_graph_api_version,
      false,
      false,
      coalesce(p_canary_mode_enabled, true),
      coalesce(p_canary_phone_numbers, '{}'),
      false
    ) returning * into v_config;
  else
    update public.orbit_meta_whatsapp_config set
      waba_id = nullif(btrim(p_waba_id), ''),
      phone_number_id = nullif(btrim(p_phone_number_id), ''),
      graph_api_version = p_graph_api_version,
      canary_mode_enabled = coalesce(p_canary_mode_enabled, true),
      canary_phone_numbers = coalesce(p_canary_phone_numbers, '{}'),
      updated_at = now()
    where id = v_config.id
    returning * into v_config;
  end if;

  if coalesce(btrim(p_access_token), '') <> '' then
    v_name := 'orbit_meta_whatsapp_access_' || replace(p_empresa_id::text, '-', '');
    v_access_token_secret_id := v_config.access_token_secret_id;
    if v_access_token_secret_id is null then
      select id into v_access_token_secret_id
      from vault.decrypted_secrets where name = v_name limit 1;
    end if;
    if v_access_token_secret_id is null then
      select vault.create_secret(btrim(p_access_token), v_name,
        'Meta WhatsApp access token for tenant ' || p_empresa_id::text)
      into v_access_token_secret_id;
    else
      perform vault.update_secret(v_access_token_secret_id, btrim(p_access_token), v_name,
        'Meta WhatsApp access token for tenant ' || p_empresa_id::text);
    end if;
    update public.orbit_meta_whatsapp_config
      set access_token_secret_id = v_access_token_secret_id, updated_at = now()
      where id = v_config.id returning * into v_config;
  end if;

  if coalesce(btrim(p_app_secret), '') <> '' then
    v_name := 'orbit_meta_whatsapp_app_' || replace(p_empresa_id::text, '-', '');
    v_app_secret_secret_id := v_config.app_secret_secret_id;
    if v_app_secret_secret_id is null then
      select id into v_app_secret_secret_id
      from vault.decrypted_secrets where name = v_name limit 1;
    end if;
    if v_app_secret_secret_id is null then
      select vault.create_secret(btrim(p_app_secret), v_name,
        'Meta app secret for WhatsApp tenant ' || p_empresa_id::text)
      into v_app_secret_secret_id;
    else
      perform vault.update_secret(v_app_secret_secret_id, btrim(p_app_secret), v_name,
        'Meta app secret for WhatsApp tenant ' || p_empresa_id::text);
    end if;
    update public.orbit_meta_whatsapp_config
      set app_secret_secret_id = v_app_secret_secret_id, updated_at = now()
      where id = v_config.id returning * into v_config;
  end if;

  if coalesce(p_ativo, false) and (
    v_config.waba_id is null or v_config.phone_number_id is null
    or v_config.access_token_secret_id is null or v_config.app_secret_secret_id is null
  ) then
    raise exception 'meta_whatsapp_credentials_incomplete';
  end if;

  if coalesce(p_envio_real_liberado, false) and not coalesce(p_ativo, false) then
    raise exception 'meta_whatsapp_provider_inactive';
  end if;

  update public.orbit_meta_whatsapp_config set
    ativo = coalesce(p_ativo, false),
    envio_real_liberado = coalesce(p_envio_real_liberado, false),
    allow_proactive_messages = coalesce(p_allow_proactive_messages, false),
    activated_at = case
      when coalesce(p_ativo, false) and not v_was_active then now()
      else activated_at
    end,
    updated_at = now()
  where id = v_config.id
  returning * into v_config;

  return public._build_orbit_meta_whatsapp_public_response(v_config.id);
end;
$$;

revoke all on function public._build_orbit_meta_whatsapp_public_response(uuid)
  from public, anon, authenticated;
revoke all on function public._build_orbit_meta_whatsapp_runtime_response(uuid)
  from public, anon, authenticated;
revoke all on function public.get_orbit_meta_whatsapp_config_public(uuid)
  from public, anon;
revoke all on function public.get_orbit_meta_whatsapp_runtime_config(uuid)
  from public, anon, authenticated;
revoke all on function public.get_orbit_meta_whatsapp_runtime_config_by_phone_id(text)
  from public, anon, authenticated;
revoke all on function public.verify_orbit_meta_whatsapp_webhook_token(text)
  from public, anon, authenticated;
revoke all on function public.upsert_orbit_meta_whatsapp_config_secure(
  uuid, text, text, text, text, text, boolean, boolean, boolean, text[], boolean
) from public, anon;

grant execute on function public.get_orbit_meta_whatsapp_config_public(uuid)
  to authenticated, service_role;
grant execute on function public.upsert_orbit_meta_whatsapp_config_secure(
  uuid, text, text, text, text, text, boolean, boolean, boolean, text[], boolean
) to authenticated, service_role;
grant execute on function public._build_orbit_meta_whatsapp_public_response(uuid)
  to service_role;
grant execute on function public._build_orbit_meta_whatsapp_runtime_response(uuid)
  to service_role;
grant execute on function public.get_orbit_meta_whatsapp_runtime_config(uuid)
  to service_role;
grant execute on function public.get_orbit_meta_whatsapp_runtime_config_by_phone_id(text)
  to service_role;
grant execute on function public.verify_orbit_meta_whatsapp_webhook_token(text)
  to service_role;

notify pgrst, 'reload schema';

commit;
