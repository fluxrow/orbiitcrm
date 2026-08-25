-- Harden credential-bearing integration configuration tables.
--
-- This migration changes privileges and RLS policy targeting only. It does not
-- read, update, rotate, or otherwise mutate stored credentials or tenant data.

begin;

alter table public.orbit_meta_config enable row level security;
alter table public.orbit_resend_config enable row level security;

-- Neither the implicit PUBLIC role nor unauthenticated API clients need direct
-- access to integration configuration. Authenticated access remains governed by
-- the existing tenant-scoped and super-admin RLS policies.
revoke all privileges on table public.orbit_meta_config from public, anon;
revoke all privileges on table public.orbit_resend_config from public, anon;

-- Table-level SELECT would override a column-level revoke. Replace it with an
-- explicit safe-column allowlist so browser clients cannot read credentials.
revoke select on table public.orbit_meta_config from authenticated;
grant select (
  id,
  empresa_id,
  facebook_page_id,
  instagram_business_id,
  ativo,
  created_at,
  updated_at
) on table public.orbit_meta_config to authenticated;

revoke select on table public.orbit_resend_config from authenticated;
grant select (
  id,
  empresa_id,
  from_email,
  from_name,
  ativo,
  created_at,
  updated_at,
  dominio_verificado,
  email_teste,
  reply_to_email
) on table public.orbit_resend_config to authenticated;

drop policy if exists "Super admin can manage all meta config"
  on public.orbit_meta_config;

create policy "Super admin can manage all meta config"
  on public.orbit_meta_config
  as permissive
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));

drop policy if exists "Super admin can manage all resend_config"
  on public.orbit_resend_config;

create policy "Super admin can manage all resend_config"
  on public.orbit_resend_config
  as permissive
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'super_admin'::public.app_role));

commit;
