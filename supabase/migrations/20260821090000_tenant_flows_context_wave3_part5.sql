-- Wave 3.5: tenant-scoped flow reads and mutations for the Fluxrow canary.
BEGIN;

INSERT INTO public.orbit_feature_flags(empresa_id,feature_key,enabled,enabled_at,rollout_metadata)
SELECT e.id,'tenant_flows_context_wave3_v1',e.slug='fluxrow',
       CASE WHEN e.slug='fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary',e.slug='fluxrow','wave','3.5')
FROM public.orbit_empresas e
WHERE e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
ON CONFLICT (empresa_id,feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(x.slug ORDER BY x.slug) INTO v_invalid
  FROM (VALUES ('fluxrow',true),('bullink-negocios',false),
               ('fabrica-de-pesquisadores',false),('viver-semijoias',false)) x(slug,enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug=x.slug
  LEFT JOIN public.orbit_feature_flags f ON f.empresa_id=e.id
    AND f.feature_key='tenant_flows_context_wave3_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM x.enabled;
  IF v_invalid IS NOT NULL THEN RAISE EXCEPTION 'TENANT_FLOWS_ROLLOUT_MISMATCH: %',v_invalid; END IF;
END $rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_flows_read_scoped(
  p_tenant_slug text,p_section text DEFAULT 'flows',p_flow_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $function$
DECLARE v_empresa_id uuid; v_data jsonb;
BEGIN
  v_empresa_id:=public.orbit_tenant_context_authorize(p_tenant_slug,'tenant_flows_context_wave3_v1');
  IF p_section='flows' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC),'[]'::jsonb) INTO v_data
    FROM public.orbit_flows f WHERE f.empresa_id=v_empresa_id AND f.deleted_at IS NULL;
  ELSIF p_section='actions' THEN
    IF NOT EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=p_flow_id AND f.empresa_id=v_empresa_id AND f.deleted_at IS NULL)
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TENANT_MISMATCH'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.ordem),'[]'::jsonb) INTO v_data
    FROM public.orbit_flow_actions a WHERE a.flow_id=p_flow_id;
  ELSIF p_section='runs' THEN
    IF NOT EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=p_flow_id AND f.empresa_id=v_empresa_id)
      THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TENANT_MISMATCH'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_data
    FROM (SELECT * FROM public.orbit_flow_runs WHERE flow_id=p_flow_id AND empresa_id=v_empresa_id ORDER BY created_at DESC LIMIT 20) r;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FLOW_SECTION_NOT_SUPPORTED';
  END IF;
  RETURN jsonb_build_object('ok',true,'section',p_section,'data',v_data);
END $function$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_flows_mutate_scoped(
  p_tenant_slug text,p_action_type text,p_flow_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_empresa_id uuid; v_is_admin boolean; v_flow public.orbit_flows%rowtype;
  v_action public.orbit_flow_actions%rowtype; v_entity jsonb; v_action_id uuid; v_count int:=0;
BEGIN
  v_empresa_id:=public.orbit_tenant_context_authorize(p_tenant_slug,'tenant_flows_context_wave3_v1');
  SELECT public.has_role(v_uid,'super_admin'::public.app_role) OR public.pe_is_super_admin(v_uid)
    OR EXISTS(SELECT 1 FROM public.user_empresa_memberships m WHERE m.user_id=v_uid AND m.empresa_id=v_empresa_id AND m.role='admin')
    OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_uid AND p.empresa_id=v_empresa_id AND p.ativo=true AND public.pe_user_is_orbit_admin(v_uid))
  INTO v_is_admin;
  IF NOT coalesce(v_is_admin,false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ADMIN_REQUIRED'; END IF;
  IF jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_PAYLOAD'; END IF;

  IF p_action_type='create_flow' THEN
    IF NOT(p_payload?'nome') OR length(trim(p_payload->>'nome')) NOT BETWEEN 1 AND 160
      THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_NAME'; END IF;
    IF jsonb_typeof(coalesce(p_payload->'actions','[]'::jsonb))<>'array' OR jsonb_array_length(coalesce(p_payload->'actions','[]'::jsonb))>100
      THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_ACTIONS'; END IF;
    INSERT INTO public.orbit_flows(empresa_id,template_id,nome,descricao,trigger_type,trigger_config,condicoes,ativo,created_by)
    VALUES(v_empresa_id,nullif(p_payload->>'template_id','')::uuid,trim(p_payload->>'nome'),p_payload->>'descricao',
      coalesce(p_payload->>'trigger_type','deal_stage_changed')::public.orbit_flow_trigger_type,
      coalesce(p_payload->'trigger_config','{}'::jsonb),coalesce(p_payload->'condicoes','{}'::jsonb),false,v_uid)
    RETURNING * INTO v_flow;
    INSERT INTO public.orbit_flow_actions(flow_id,ordem,action_type,action_config,delay_seconds)
    SELECT v_flow.id,(x.ord-1)::int,(x.item->>'action_type')::public.orbit_flow_action_type,
      coalesce(x.item->'action_config','{}'::jsonb),greatest(0,coalesce((x.item->>'delay_seconds')::int,0))
    FROM jsonb_array_elements(coalesce(p_payload->'actions','[]'::jsonb)) WITH ORDINALITY x(item,ord);
    GET DIAGNOSTICS v_count=ROW_COUNT; v_entity:=to_jsonb(v_flow);
  ELSE
    SELECT * INTO v_flow FROM public.orbit_flows f WHERE f.id=p_flow_id AND f.empresa_id=v_empresa_id AND f.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_TENANT_MISMATCH'; END IF;
    IF p_action_type='toggle_flow' THEN
      UPDATE public.orbit_flows SET ativo=coalesce((p_payload->>'ativo')::boolean,false),updated_at=now() WHERE id=v_flow.id RETURNING * INTO v_flow;
      v_entity:=to_jsonb(v_flow); v_count:=1;
    ELSIF p_action_type='soft_delete_flow' THEN
      UPDATE public.orbit_flows SET deleted_at=now(),ativo=false,updated_at=now() WHERE id=v_flow.id RETURNING * INTO v_flow;
      v_entity:=to_jsonb(v_flow); v_count:=1;
    ELSIF p_action_type='update_conditions' THEN
      IF jsonb_typeof(coalesce(p_payload->'condicoes','{}'::jsonb))<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_CONDITIONS'; END IF;
      UPDATE public.orbit_flows SET condicoes=coalesce(p_payload->'condicoes','{}'::jsonb),updated_at=now() WHERE id=v_flow.id RETURNING * INTO v_flow;
      v_entity:=to_jsonb(v_flow); v_count:=1;
    ELSIF p_action_type='upsert_action' THEN
      v_action_id:=nullif(p_payload->>'id','')::uuid;
      IF NOT (p_payload?'action_type') OR coalesce((p_payload->>'ordem')::int,0) NOT BETWEEN 0 AND 999
        OR coalesce((p_payload->>'delay_seconds')::int,0) NOT BETWEEN 0 AND 2592000
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_ACTION'; END IF;
      IF v_action_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orbit_flow_actions a WHERE a.id=v_action_id AND a.flow_id=v_flow.id)
        THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_ACTION_TENANT_MISMATCH'; END IF;
      INSERT INTO public.orbit_flow_actions(id,flow_id,ordem,action_type,action_config,delay_seconds)
      VALUES(coalesce(v_action_id,gen_random_uuid()),v_flow.id,coalesce((p_payload->>'ordem')::int,0),
        (p_payload->>'action_type')::public.orbit_flow_action_type,coalesce(p_payload->'action_config','{}'::jsonb),coalesce((p_payload->>'delay_seconds')::int,0))
      ON CONFLICT(id) DO UPDATE SET ordem=excluded.ordem,action_type=excluded.action_type,action_config=excluded.action_config,delay_seconds=excluded.delay_seconds,updated_at=now()
      RETURNING * INTO v_action; v_entity:=to_jsonb(v_action); v_count:=1;
    ELSIF p_action_type='delete_action' THEN
      v_action_id:=nullif(p_payload->>'action_id','')::uuid;
      DELETE FROM public.orbit_flow_actions a WHERE a.id=v_action_id AND a.flow_id=v_flow.id RETURNING * INTO v_action;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_ACTION_TENANT_MISMATCH'; END IF;
      v_entity:=to_jsonb(v_action); v_count:=1;
    ELSIF p_action_type='reorder_actions' THEN
      IF jsonb_typeof(coalesce(p_payload->'ordered_ids','null'::jsonb))<>'array'
        OR jsonb_array_length(p_payload->'ordered_ids')>100
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_ACTION_ORDER'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements_text(p_payload->'ordered_ids'))
          <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload->'ordered_ids'))
        THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='DUPLICATE_ACTION_ORDER'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'ordered_ids') x(id) LEFT JOIN public.orbit_flow_actions a ON a.id=x.id::uuid AND a.flow_id=v_flow.id WHERE a.id IS NULL)
        THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='FLOW_ACTION_TENANT_MISMATCH'; END IF;
      UPDATE public.orbit_flow_actions a SET ordem=(x.ord-1)::int,updated_at=now()
      FROM jsonb_array_elements_text(p_payload->'ordered_ids') WITH ORDINALITY x(id,ord)
      WHERE a.id=x.id::uuid AND a.flow_id=v_flow.id;
      GET DIAGNOSTICS v_count=ROW_COUNT; v_entity:=jsonb_build_object('changed',v_count);
    ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='FLOW_ACTION_NOT_SUPPORTED';
    END IF;
  END IF;

  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_empresa_id,v_uid,p_action_type,'orbit_flows',coalesce(v_flow.id,p_flow_id),
    jsonb_build_object('source','tenant_flows_context_wave3_v1','affected_rows',v_count));
  RETURN jsonb_build_object('ok',true,'action',p_action_type,'flow_id',coalesce(v_flow.id,p_flow_id),'data',v_entity,'affected_rows',v_count);
END $function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_flows_read_scoped(text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_flows_mutate_scoped(text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_flows_read_scoped(text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_flows_mutate_scoped(text,text,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_flows_direct_dml_allowed(p_empresa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags f WHERE f.empresa_id=p_empresa_id AND f.feature_key='tenant_flows_context_wave3_v1' AND f.enabled=true)
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_flows_direct_dml_allowed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_flows_direct_dml_allowed(uuid) TO authenticated;

ALTER TABLE public.orbit_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_flow_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_flows_wave3_insert_guard ON public.orbit_flows;
DROP POLICY IF EXISTS tenant_flows_wave3_update_guard ON public.orbit_flows;
DROP POLICY IF EXISTS tenant_flows_wave3_delete_guard ON public.orbit_flows;
DROP POLICY IF EXISTS tenant_flow_actions_wave3_insert_guard ON public.orbit_flow_actions;
DROP POLICY IF EXISTS tenant_flow_actions_wave3_update_guard ON public.orbit_flow_actions;
DROP POLICY IF EXISTS tenant_flow_actions_wave3_delete_guard ON public.orbit_flow_actions;
CREATE POLICY tenant_flows_wave3_insert_guard ON public.orbit_flows AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.orbit_tenant_flows_direct_dml_allowed(empresa_id));
CREATE POLICY tenant_flows_wave3_update_guard ON public.orbit_flows AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.orbit_tenant_flows_direct_dml_allowed(empresa_id)) WITH CHECK(public.orbit_tenant_flows_direct_dml_allowed(empresa_id));
CREATE POLICY tenant_flows_wave3_delete_guard ON public.orbit_flows AS RESTRICTIVE FOR DELETE TO authenticated USING(public.orbit_tenant_flows_direct_dml_allowed(empresa_id));
CREATE POLICY tenant_flow_actions_wave3_insert_guard ON public.orbit_flow_actions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=orbit_flow_actions.flow_id AND public.orbit_tenant_flows_direct_dml_allowed(f.empresa_id)));
CREATE POLICY tenant_flow_actions_wave3_update_guard ON public.orbit_flow_actions AS RESTRICTIVE FOR UPDATE TO authenticated USING(EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=orbit_flow_actions.flow_id AND public.orbit_tenant_flows_direct_dml_allowed(f.empresa_id))) WITH CHECK(EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=orbit_flow_actions.flow_id AND public.orbit_tenant_flows_direct_dml_allowed(f.empresa_id)));
CREATE POLICY tenant_flow_actions_wave3_delete_guard ON public.orbit_flow_actions AS RESTRICTIVE FOR DELETE TO authenticated USING(EXISTS(SELECT 1 FROM public.orbit_flows f WHERE f.id=orbit_flow_actions.flow_id AND public.orbit_tenant_flows_direct_dml_allowed(f.empresa_id)));

COMMIT;
