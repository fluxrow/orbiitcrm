create or replace function public.orbit_search_normalize(_input text)
returns text language sql immutable set search_path = public as $$
  select lower(translate(coalesce(_input, ''),
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'))
$$;

create or replace function public.orbit_search_digits(_input text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(_input, ''), '[^0-9]', '', 'g')
$$;

create or replace function public.orbit_global_search(_empresa_id uuid, _term text, _limit integer default 20)
returns table (kind text, id uuid, title text, subtitle text, detail text, prospect_id uuid, conversa_id uuid, updated_at timestamptz)
language plpgsql stable security invoker set search_path = public as $$
declare
  norm text := public.orbit_search_normalize(btrim(coalesce(_term, '')));
  digits text := public.orbit_search_digits(_term);
  pat text;
  digit_pat text;
  lim integer := least(greatest(coalesce(_limit, 20), 1), 50);
begin
  if norm = '' or char_length(norm) < 2 then
    return;
  end if;

  pat := '%' || replace(replace(replace(norm, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  digit_pat := case when char_length(digits) >= 4 then '%' || digits || '%' else null end;

  return query
  select 'conversa'::text, c.id,
         coalesce(p.nome_contato, p.nome_razao, c.telefone_whatsapp)::text,
         c.telefone_whatsapp::text,
         c.ultima_mensagem_preview::text,
         c.prospect_id, c.id,
         coalesce(c.ultima_mensagem_at, c.updated_at, c.created_at)
  from public.orbit_conversas c
  left join public.orbit_prospects p on p.id = c.prospect_id
  where c.empresa_id = _empresa_id
    and (
      public.orbit_search_normalize(p.nome_contato) like pat escape '\'
      or public.orbit_search_normalize(p.nome_razao) like pat escape '\'
      or public.orbit_search_normalize(p.nome_fantasia) like pat escape '\'
      or public.orbit_search_normalize(p.email_principal) like pat escape '\'
      or public.orbit_search_normalize(c.ultima_mensagem_preview) like pat escape '\'
      or (digit_pat is not null and (
        public.orbit_search_digits(c.telefone_whatsapp) like digit_pat
        or public.orbit_search_digits(p.telefone) like digit_pat
        or public.orbit_search_digits(p.whatsapp) like digit_pat))
    )
  order by 8 desc nulls last
  limit lim;

  return query
  select 'prospect'::text, p.id,
         coalesce(p.nome_contato, p.nome_razao)::text,
         coalesce(p.nome_fantasia, p.nome_razao)::text,
         coalesce(p.email_principal, p.whatsapp, p.telefone, p.cidade)::text,
         p.id, null::uuid,
         coalesce(p.updated_at, p.created_at)
  from public.orbit_prospects p
  where p.empresa_id = _empresa_id
    and p.deleted_at is null
    and (
      public.orbit_search_normalize(p.nome_contato) like pat escape '\'
      or public.orbit_search_normalize(p.nome_razao) like pat escape '\'
      or public.orbit_search_normalize(p.nome_fantasia) like pat escape '\'
      or public.orbit_search_normalize(p.email_principal) like pat escape '\'
      or public.orbit_search_normalize(p.cidade) like pat escape '\'
      or public.orbit_search_normalize(p.cnpj_cpf) like pat escape '\'
      or public.orbit_search_normalize(array_to_string(coalesce(p.tags, '{}'), ' ')) like pat escape '\'
      or public.orbit_search_normalize(p.dados_adicionais::text) like pat escape '\'
      or (digit_pat is not null and (
        public.orbit_search_digits(p.telefone) like digit_pat
        or public.orbit_search_digits(p.whatsapp) like digit_pat
        or public.orbit_search_digits(p.cnpj_cpf) like digit_pat))
    )
  order by 8 desc nulls last
  limit lim;

  return query
  select 'deal'::text, d.id, d.titulo::text,
         coalesce(p.nome_contato, p.nome_razao)::text,
         d.status::text, d.prospect_id, null::uuid,
         coalesce(d.updated_at, d.created_at)
  from public.orbit_deals d
  left join public.orbit_prospects p on p.id = d.prospect_id
  where d.empresa_id = _empresa_id
    and d.deleted_at is null
    and (
      public.orbit_search_normalize(d.titulo) like pat escape '\'
      or public.orbit_search_normalize(d.motivo_perda) like pat escape '\'
      or public.orbit_search_normalize(p.nome_contato) like pat escape '\'
      or public.orbit_search_normalize(p.nome_razao) like pat escape '\'
      or public.orbit_search_normalize(p.email_principal) like pat escape '\'
      or (digit_pat is not null and (
        public.orbit_search_digits(p.telefone) like digit_pat
        or public.orbit_search_digits(p.whatsapp) like digit_pat))
    )
  order by 8 desc nulls last
  limit lim;

  return query
  select 'tarefa'::text, t.id, t.titulo::text,
         coalesce(p.nome_contato, p.nome_razao)::text,
         t.status::text, t.prospect_id, null::uuid,
         coalesce(t.updated_at, t.created_at)
  from public.orbit_tasks t
  left join public.orbit_prospects p on p.id = t.prospect_id
  where t.empresa_id = _empresa_id
    and (
      public.orbit_search_normalize(t.titulo) like pat escape '\'
      or public.orbit_search_normalize(t.descricao) like pat escape '\'
      or public.orbit_search_normalize(p.nome_contato) like pat escape '\'
      or public.orbit_search_normalize(p.nome_razao) like pat escape '\'
      or public.orbit_search_normalize(p.email_principal) like pat escape '\'
      or (digit_pat is not null and (
        public.orbit_search_digits(p.telefone) like digit_pat
        or public.orbit_search_digits(p.whatsapp) like digit_pat))
    )
  order by 8 desc nulls last
  limit lim;
end;
$$;

revoke all on function public.orbit_global_search(uuid, text, integer) from public;
grant execute on function public.orbit_global_search(uuid, text, integer) to authenticated;
grant execute on function public.orbit_search_normalize(text) to authenticated;
grant execute on function public.orbit_search_digits(text) to authenticated;