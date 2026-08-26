-- Corrige colisões entre nomes das colunas retornadas pela RPC e colunas da
-- tabela de claims. O erro bloqueava toda execução antes da geração da IA.

create or replace function public.claim_orbit_ai_execution(
  _empresa_id uuid,
  _conversa_id uuid,
  _inbound_message_id uuid,
  _lease_seconds integer default 300
) returns table(
  claim_id uuid,
  lease_token uuid,
  acquired boolean,
  reason text,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _existing public.orbit_ai_execution_claims%rowtype;
  _token uuid := gen_random_uuid();
  _expires timestamptz := now() + make_interval(
    secs => least(greatest(_lease_seconds, 60), 900)
  );
  _claimed_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(_empresa_id::text || ':' || _conversa_id::text, 0)
  );

  if not exists (
    select 1
      from public.orbit_conversas as c
     where c.id = _conversa_id
       and c.empresa_id = _empresa_id
  ) then
    return query
      select null::uuid, null::uuid, false, 'tenant_mismatch', null::timestamptz;
    return;
  end if;

  if not exists (
    select 1
      from public.orbit_mensagens as m
     where m.id = _inbound_message_id
       and m.empresa_id = _empresa_id
       and m.conversa_id = _conversa_id
       and m.direcao = 'IN'
  ) then
    return query
      select null::uuid, null::uuid, false, 'invalid_inbound_message', null::timestamptz;
    return;
  end if;

  select c.*
    into _existing
    from public.orbit_ai_execution_claims as c
   where c.empresa_id = _empresa_id
     and c.conversa_id = _conversa_id
     and c.inbound_message_id = _inbound_message_id;

  if found and _existing.status = 'finished' then
    return query select
      _existing.id,
      _existing.lease_token,
      false,
      'event_already_finished',
      _existing.lease_expires_at;
    return;
  end if;

  if found
     and _existing.status = 'running'
     and _existing.lease_expires_at > now() then
    return query select
      _existing.id,
      _existing.lease_token,
      false,
      'event_already_active',
      _existing.lease_expires_at;
    return;
  end if;

  update public.orbit_ai_execution_claims as c
     set status = 'expired',
         finished_at = coalesce(c.finished_at, now()),
         result = 'lease_expired'
   where c.empresa_id = _empresa_id
     and c.conversa_id = _conversa_id
     and c.status = 'running'
     and c.lease_expires_at <= now();

  if exists (
    select 1
      from public.orbit_ai_execution_claims as c
     where c.empresa_id = _empresa_id
       and c.conversa_id = _conversa_id
       and c.status = 'running'
       and c.lease_expires_at > now()
  ) then
    insert into public.orbit_ai_execution_claims as c (
      empresa_id,
      conversa_id,
      inbound_message_id,
      status,
      lease_token,
      lease_expires_at
    ) values (
      _empresa_id,
      _conversa_id,
      _inbound_message_id,
      'queued',
      _token,
      now()
    )
    on conflict (empresa_id, conversa_id, inbound_message_id) do nothing;

    select c.*
      into _existing
      from public.orbit_ai_execution_claims as c
     where c.empresa_id = _empresa_id
       and c.conversa_id = _conversa_id
       and c.inbound_message_id = _inbound_message_id;

    return query select
      _existing.id,
      null::uuid,
      false,
      'event_queued',
      _existing.lease_expires_at;
    return;
  end if;

  if _existing.id is not null then
    update public.orbit_ai_execution_claims as c
       set status = 'running',
           lease_token = _token,
           lease_expires_at = _expires,
           heartbeat_at = now(),
           started_at = now(),
           finished_at = null,
           result = null,
           attempts = c.attempts + 1
     where c.id = _existing.id
     returning c.id into _claimed_id;
  else
    insert into public.orbit_ai_execution_claims as c (
      empresa_id,
      conversa_id,
      inbound_message_id,
      lease_token,
      lease_expires_at
    ) values (
      _empresa_id,
      _conversa_id,
      _inbound_message_id,
      _token,
      _expires
    )
    returning c.id into _claimed_id;
  end if;

  return query select
    _claimed_id,
    _token,
    true,
    case when _existing.id is null then 'acquired' else 'recovered_expired' end,
    _expires;
end;
$$;

revoke all on function public.claim_orbit_ai_execution(uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_orbit_ai_execution(uuid, uuid, uuid, integer)
  to service_role;

