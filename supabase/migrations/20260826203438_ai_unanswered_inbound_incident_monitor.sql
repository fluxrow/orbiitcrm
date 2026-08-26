-- Detector interno de inbounds elegíveis sem resposta.
-- O monitor somente persiste telemetria: não chama IA, não cria outbox e não
-- envia alertas externos nesta onda.

create table if not exists public.orbit_ai_delivery_incidents (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  conversa_id uuid not null references public.orbit_conversas(id) on delete cascade,
  inbound_message_id uuid not null references public.orbit_mensagens(id) on delete cascade,
  incident_type text not null
    check (incident_type in ('missing_dispatch','execution_failed','delivery_failed','stalled')),
  severity text not null default 'warning' check (severity in ('warning','critical')),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  inbound_at timestamptz not null,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  occurrences integer not null default 1 check (occurrences > 0),
  artifacts jsonb not null default '{}'::jsonb,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, conversa_id, inbound_message_id, incident_type),
  check (jsonb_typeof(artifacts) = 'object'),
  check ((status = 'open' and resolved_at is null) or status <> 'open')
);

create index if not exists orbit_ai_delivery_incidents_open_tenant_idx
  on public.orbit_ai_delivery_incidents (empresa_id, severity, first_detected_at)
  where status = 'open';

alter table public.orbit_ai_delivery_incidents enable row level security;
revoke all on table public.orbit_ai_delivery_incidents from public, anon, authenticated;
grant all on table public.orbit_ai_delivery_incidents to service_role;

create or replace function public.orbit_scan_unanswered_inbounds(
  p_min_age interval default interval '3 minutes',
  p_lookback interval default interval '6 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detected integer := 0;
  v_resolved integer := 0;
begin
  if p_min_age < interval '1 minute' or p_min_age > interval '30 minutes' then
    raise exception using errcode='22023', message='INVALID_MIN_AGE';
  end if;
  if p_lookback < interval '30 minutes' or p_lookback > interval '24 hours' then
    raise exception using errcode='22023', message='INVALID_LOOKBACK';
  end if;

  -- Fecha automaticamente incidentes que receberam resposta, foram assumidos,
  -- arquivados ou quarentenados depois da detecção.
  update public.orbit_ai_delivery_incidents as i
     set status = 'resolved',
         resolution = case
           when c.human_talk = true or c.human_user_id is not null then 'human_takeover'
           when c.archived_at is not null then 'conversation_archived'
           when c.quarantine_reason is not null then 'conversation_quarantined'
           else 'answered'
         end,
         resolved_at = now(),
         updated_at = now()
    from public.orbit_conversas as c
   where i.status = 'open'
     and c.id = i.conversa_id
     and c.empresa_id = i.empresa_id
     and (
       c.human_talk = true
       or c.human_user_id is not null
       or c.archived_at is not null
       or c.quarantine_reason is not null
       or exists (
         select 1
           from public.orbit_mensagens as mo
          where mo.empresa_id = i.empresa_id
            and mo.conversa_id = i.conversa_id
            and mo.direcao = 'OUT'
            and mo.timestamp > i.inbound_at
            and lower(coalesce(mo.status,'')) not in
              ('queued','cancelada','canceled','falhou','failed','pendente')
       )
     );
  get diagnostics v_resolved = row_count;

  with latest_in as (
    select distinct on (m.empresa_id, m.conversa_id)
      m.id as inbound_message_id,
      m.empresa_id,
      m.conversa_id,
      m.timestamp as inbound_at
    from public.orbit_mensagens as m
    where m.direcao = 'IN'
      and m.timestamp >= now() - p_lookback
      and m.timestamp <= now() - p_min_age
    order by m.empresa_id, m.conversa_id, m.timestamp desc, m.id desc
  ), eligible as (
    select
      li.*,
      case
        when coalesce(ai.responder_fora_horario, false) then true
        when coalesce(ai.horario_inicio, time '00:00') <= coalesce(ai.horario_fim, time '23:59:59') then
          timezone('America/Sao_Paulo', li.inbound_at)::time
            between coalesce(ai.horario_inicio, time '00:00') and coalesce(ai.horario_fim, time '23:59:59')
        else
          timezone('America/Sao_Paulo', li.inbound_at)::time >= coalesce(ai.horario_inicio, time '00:00')
          or timezone('America/Sao_Paulo', li.inbound_at)::time <= coalesce(ai.horario_fim, time '23:59:59')
      end as inside_service_window
    from latest_in as li
    join public.orbit_conversas as c
      on c.id = li.conversa_id and c.empresa_id = li.empresa_id
    join public.orbit_ai_config as ai on ai.empresa_id = li.empresa_id
    where ai.modo_automatico = true
      and coalesce(c.human_talk, false) = false
      and c.human_user_id is null
      and c.archived_at is null
      and c.quarantine_reason is null
      and lower(coalesce(c.status, '')) not in ('fechada','closed','encerrada')
      and not exists (
        select 1 from public.orbit_mensagens as mo
        where mo.empresa_id = li.empresa_id
          and mo.conversa_id = li.conversa_id
          and mo.direcao = 'OUT'
          and mo.timestamp > li.inbound_at
          and lower(coalesce(mo.status,'')) not in
            ('queued','cancelada','canceled','falhou','failed','pendente')
      )
  ), classified as (
    select
      e.*,
      coalesce((
        select jsonb_agg(jsonb_build_object('status',x.status,'attempts',x.attempts))
        from public.orbit_ai_execution_claims x
        where x.empresa_id=e.empresa_id and x.conversa_id=e.conversa_id
          and x.inbound_message_id=e.inbound_message_id
      ), '[]'::jsonb) as claims,
      coalesce((
        select jsonb_agg(jsonb_build_object('status',d.status,'attempts',d.attempts))
        from public.orbit_ai_reply_debounce d
        where d.empresa_id=e.empresa_id and d.conversa_id=e.conversa_id
          and d.last_inbound_message_id=e.inbound_message_id
      ), '[]'::jsonb) as debounce,
      coalesce((
        select jsonb_agg(jsonb_build_object('status',o.status,'source_type',o.source_type))
        from public.orbit_whatsapp_outbox o
        where o.empresa_id=e.empresa_id and o.conversa_id=e.conversa_id
          and o.source_type='ai_reply' and o.created_at >= e.inbound_at
      ), '[]'::jsonb) as outbox
    from eligible e
    where e.inside_service_window = true
      and not exists (
        select 1 from public.orbit_ai_execution_claims x
        where x.empresa_id=e.empresa_id and x.conversa_id=e.conversa_id
          and x.inbound_message_id=e.inbound_message_id
          and x.status='running' and x.lease_expires_at>now()
      )
      and not exists (
        select 1 from public.orbit_ai_reply_debounce d
        where d.empresa_id=e.empresa_id and d.conversa_id=e.conversa_id
          and d.last_inbound_message_id=e.inbound_message_id
          and d.status in ('pending','generating')
      )
      and not exists (
        select 1 from public.orbit_whatsapp_outbox o
        where o.empresa_id=e.empresa_id and o.conversa_id=e.conversa_id
          and o.source_type='ai_reply' and o.created_at>=e.inbound_at
          and o.status in ('pending','processing','sent')
      )
  ), incidents as (
    select
      c.*,
      case
        when jsonb_array_length(c.claims)=0 and jsonb_array_length(c.debounce)=0 and jsonb_array_length(c.outbox)=0
          then 'missing_dispatch'
        when c.claims @> '[{"status":"error"}]'::jsonb or c.claims @> '[{"status":"expired"}]'::jsonb
          then 'execution_failed'
        when c.outbox @> '[{"status":"failed"}]'::jsonb or c.outbox @> '[{"status":"falhou"}]'::jsonb
          then 'delivery_failed'
        else 'stalled'
      end as incident_type
    from classified c
  ), upserted as (
    insert into public.orbit_ai_delivery_incidents (
      empresa_id, conversa_id, inbound_message_id, incident_type, severity,
      inbound_at, artifacts
    )
    select
      i.empresa_id,
      i.conversa_id,
      i.inbound_message_id,
      i.incident_type,
      case when now()-i.inbound_at >= interval '15 minutes' then 'critical' else 'warning' end,
      i.inbound_at,
      jsonb_build_object('claims',i.claims,'debounce',i.debounce,'outbox',i.outbox)
    from incidents i
    on conflict (empresa_id, conversa_id, inbound_message_id, incident_type)
    do update set
      last_detected_at = now(),
      occurrences = public.orbit_ai_delivery_incidents.occurrences + 1,
      severity = excluded.severity,
      artifacts = excluded.artifacts,
      updated_at = now()
    where public.orbit_ai_delivery_incidents.status = 'open'
    returning 1
  )
  select count(*) into v_detected from upserted;

  return jsonb_build_object(
    'ok', true,
    'detected_or_refreshed', v_detected,
    'resolved', v_resolved,
    'executed_at', now(),
    'communicational_actions', 0,
    'reprocessed', 0
  );
end;
$$;

revoke all on function public.orbit_scan_unanswered_inbounds(interval, interval)
  from public, anon, authenticated;
grant execute on function public.orbit_scan_unanswered_inbounds(interval, interval)
  to service_role;

comment on function public.orbit_scan_unanswered_inbounds(interval, interval) is
  'Detector idempotente. Somente registra/resolve incidentes; nunca envia ou reprocessa.';

do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    if exists (select 1 from cron.job where jobname='orbit-ai-unanswered-monitor-v1') then
      perform cron.unschedule('orbit-ai-unanswered-monitor-v1');
    end if;
    perform cron.schedule(
      'orbit-ai-unanswered-monitor-v1',
      '*/5 * * * *',
      $job$select public.orbit_scan_unanswered_inbounds(interval '3 minutes', interval '6 hours');$job$
    );
  end if;
end;
$$;
