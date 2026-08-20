CREATE TABLE public.orbit_prompt_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  runtime_slot text NOT NULL CHECK (runtime_slot IN ('prompt_identidade','prompt_roteiro','prompt_regras')),
  is_runtime_active boolean NOT NULL DEFAULT false,
  draft_content text NOT NULL DEFAULT '',
  draft_description text,
  draft_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  draft_updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_prompt_definitions_tenant_name_key UNIQUE (empresa_id, name),
  CONSTRAINT orbit_prompt_definitions_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE TABLE public.orbit_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL REFERENCES public.orbit_prompt_definitions(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  description text,
  changelog text NOT NULL CHECK (length(btrim(changelog)) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT false,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_prompt_versions_prompt_version_key UNIQUE (prompt_id, version_number)
);

ALTER TABLE public.orbit_prompt_definitions
  ADD COLUMN active_version_id uuid REFERENCES public.orbit_prompt_versions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX orbit_prompt_versions_one_active_idx
  ON public.orbit_prompt_versions(prompt_id) WHERE is_active;
CREATE INDEX orbit_prompt_versions_tenant_prompt_idx
  ON public.orbit_prompt_versions(empresa_id, prompt_id, version_number DESC);

CREATE TABLE public.orbit_flow_drafts (
  flow_id uuid PRIMARY KEY REFERENCES public.orbit_flows(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  name text NOT NULL,
  nodes_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  edges_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  changelog text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_flow_drafts_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE TABLE public.orbit_flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.orbit_flows(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  name text NOT NULL,
  nodes_schema jsonb NOT NULL,
  edges_schema jsonb NOT NULL,
  changelog text NOT NULL CHECK (length(btrim(changelog)) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT false,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_flow_versions_flow_version_key UNIQUE (flow_id, version_number),
  CONSTRAINT orbit_flow_versions_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE UNIQUE INDEX orbit_flow_versions_one_active_idx
  ON public.orbit_flow_versions(flow_id) WHERE is_active;
CREATE INDEX orbit_flow_versions_tenant_flow_idx
  ON public.orbit_flow_versions(empresa_id, flow_id, version_number DESC);

ALTER TABLE public.orbit_prompt_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_flow_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_flow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY orbit_prompt_definitions_select_tenant ON public.orbit_prompt_definitions
FOR SELECT TO authenticated USING (empresa_id=(SELECT p.empresa_id FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo=true));
CREATE POLICY orbit_prompt_versions_select_tenant ON public.orbit_prompt_versions
FOR SELECT TO authenticated USING (empresa_id=(SELECT p.empresa_id FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo=true));
CREATE POLICY orbit_flow_drafts_select_tenant ON public.orbit_flow_drafts
FOR SELECT TO authenticated USING (empresa_id=(SELECT p.empresa_id FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo=true));
CREATE POLICY orbit_flow_versions_select_tenant ON public.orbit_flow_versions
FOR SELECT TO authenticated USING (empresa_id=(SELECT p.empresa_id FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo=true));

REVOKE ALL ON public.orbit_prompt_definitions, public.orbit_prompt_versions, public.orbit_flow_drafts, public.orbit_flow_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orbit_prompt_definitions, public.orbit_prompt_versions, public.orbit_flow_drafts, public.orbit_flow_versions TO authenticated, service_role;
GRANT ALL ON public.orbit_prompt_definitions, public.orbit_prompt_versions, public.orbit_flow_drafts, public.orbit_flow_versions TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_version_rows_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
  IF NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id
     OR to_jsonb(NEW)-'is_active' IS DISTINCT FROM to_jsonb(OLD)-'is_active' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IMMUTABLE_VERSION';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER orbit_prompt_versions_immutable
BEFORE UPDATE ON public.orbit_prompt_versions FOR EACH ROW EXECUTE FUNCTION public.orbit_version_rows_immutable();
CREATE TRIGGER orbit_flow_versions_immutable
BEFORE UPDATE ON public.orbit_flow_versions FOR EACH ROW EXECUTE FUNCTION public.orbit_version_rows_immutable();

REVOKE ALL ON FUNCTION public.orbit_version_rows_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orbit_validate_flow_schemas(p_nodes jsonb,p_edges jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $function$
DECLARE v_node jsonb; v_edge jsonb; v_ids text[]:=ARRAY[]::text[]; v_id text;
BEGIN
  IF jsonb_typeof(p_nodes)<>'object' OR jsonb_typeof(p_nodes->'nodes')<>'array'
     OR jsonb_typeof(coalesce(p_nodes->'trigger_config','{}'::jsonb))<>'object'
     OR jsonb_typeof(coalesce(p_nodes->'conditions','{}'::jsonb))<>'object'
     OR NOT EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='orbit_flow_trigger_type' AND e.enumlabel=p_nodes->>'trigger_type') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_NODES_SCHEMA';
  END IF;
  IF jsonb_typeof(p_edges)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_EDGES_SCHEMA'; END IF;
  FOR v_node IN SELECT value FROM jsonb_array_elements(p_nodes->'nodes') LOOP
    v_id:=v_node->>'id';
    IF v_id IS NULL OR v_id !~ '^[0-9a-fA-F-]{36}$' OR v_id=ANY(v_ids)
       OR NOT EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='orbit_flow_action_type' AND e.enumlabel=v_node->>'action_type')
       OR jsonb_typeof(coalesce(v_node->'action_config','{}'::jsonb))<>'object'
       OR coalesce(v_node->>'order','') !~ '^\d+$' OR coalesce(v_node->>'delay_seconds','') !~ '^\d+$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_NODE';
    END IF;
    v_ids:=array_append(v_ids,v_id);
  END LOOP;
  FOR v_edge IN SELECT value FROM jsonb_array_elements(p_edges) LOOP
    IF jsonb_typeof(v_edge)<>'object' OR NOT (v_edge->>'source'=ANY(v_ids)) OR NOT (v_edge->>'target'=ANY(v_ids)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_EDGE';
    END IF;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.orbit_validate_flow_schemas(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.orbit_apply_flow_version(p_empresa_id uuid,p_flow_id uuid,p_name text,p_nodes jsonb,p_edges jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_node jsonb; v_count integer:=0;
BEGIN
  PERFORM public.orbit_validate_flow_schemas(p_nodes,p_edges);
  UPDATE public.orbit_flows SET nome=p_name,trigger_type=(p_nodes->>'trigger_type')::public.orbit_flow_trigger_type,
    trigger_config=coalesce(p_nodes->'trigger_config','{}'::jsonb),condicoes=coalesce(p_nodes->'conditions','{}'::jsonb),
    ativo=true,deleted_at=NULL,updated_at=now() WHERE id=p_flow_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FLOW_NOT_FOUND'; END IF;
  UPDATE public.orbit_flow_actions SET action_config=jsonb_set(action_config,'{enabled}','false'::jsonb,true),updated_at=now()
    WHERE flow_id=p_flow_id AND id::text NOT IN (SELECT value->>'id' FROM jsonb_array_elements(p_nodes->'nodes'));
  FOR v_node IN SELECT value FROM jsonb_array_elements(p_nodes->'nodes') LOOP
    IF EXISTS(SELECT 1 FROM public.orbit_flow_actions WHERE id=(v_node->>'id')::uuid AND flow_id<>p_flow_id) THEN
      RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='FLOW_NODE_ID_CONFLICT';
    END IF;
    INSERT INTO public.orbit_flow_actions(id,flow_id,ordem,action_type,action_config,delay_seconds,updated_at)
    VALUES((v_node->>'id')::uuid,p_flow_id,(v_node->>'order')::integer,(v_node->>'action_type')::public.orbit_flow_action_type,
      coalesce(v_node->'action_config','{}'::jsonb),(v_node->>'delay_seconds')::integer,now())
    ON CONFLICT(id) DO UPDATE SET ordem=excluded.ordem,action_type=excluded.action_type,action_config=excluded.action_config,delay_seconds=excluded.delay_seconds,updated_at=now();
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count+1;
END;
$function$;
REVOKE ALL ON FUNCTION public.orbit_apply_flow_version(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

-- Establish immutable v1 baselines without changing runtime values.
INSERT INTO public.orbit_prompt_definitions(empresa_id,name,description,runtime_slot,draft_content,draft_description)
SELECT a.empresa_id,x.name,x.description,x.slot,x.content,x.description
FROM public.orbit_ai_config a
CROSS JOIN LATERAL (VALUES
 ('Prompt de Identidade','Identidade e papel principal da IA.','prompt_identidade',coalesce(a.prompt_identidade,'')),
 ('Roteiro de Atendimento','Roteiro comercial e sequência de atendimento.','prompt_roteiro',coalesce(a.prompt_roteiro,'')),
 ('Regras da IA','Restrições e regras obrigatórias de resposta.','prompt_regras',coalesce(a.prompt_regras,''))
) x(name,description,slot,content)
WHERE a.empresa_id IS NOT NULL
ON CONFLICT(empresa_id,name) DO NOTHING;

INSERT INTO public.orbit_prompt_versions(empresa_id,prompt_id,version_number,content,description,changelog,is_active,published_at)
SELECT d.empresa_id,d.id,1,d.draft_content,d.draft_description,'Baseline importada da configuração ativa',true,coalesce(d.created_at,now())
FROM public.orbit_prompt_definitions d WHERE length(btrim(d.draft_content))>0
ON CONFLICT(prompt_id,version_number) DO NOTHING;

UPDATE public.orbit_prompt_definitions d SET active_version_id=v.id,is_runtime_active=true
FROM public.orbit_prompt_versions v WHERE v.prompt_id=d.id AND v.is_active;

INSERT INTO public.orbit_flow_drafts(flow_id,empresa_id,name,nodes_schema,edges_schema,updated_at)
SELECT f.id,f.empresa_id,f.nome,jsonb_build_object(
 'trigger_type',f.trigger_type,'trigger_config',f.trigger_config,'conditions',f.condicoes,
 'nodes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'order',a.ordem,'action_type',a.action_type,'action_config',a.action_config,'delay_seconds',a.delay_seconds) ORDER BY a.ordem) FROM public.orbit_flow_actions a WHERE a.flow_id=f.id),'[]'::jsonb)
),'[]'::jsonb,f.updated_at FROM public.orbit_flows f WHERE f.deleted_at IS NULL
ON CONFLICT(flow_id) DO NOTHING;

INSERT INTO public.orbit_flow_versions(empresa_id,flow_id,version_number,name,nodes_schema,edges_schema,changelog,is_active,published_at)
SELECT d.empresa_id,d.flow_id,1,d.name,d.nodes_schema,d.edges_schema,'Baseline importada do fluxo ativo',true,d.updated_at
FROM public.orbit_flow_drafts d JOIN public.orbit_flows f ON f.id=d.flow_id WHERE f.ativo=true
ON CONFLICT(flow_id,version_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_content_action(p_empresa_id uuid,p_tenant_slug text,p_action_type text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
 v_actor uuid:=auth.uid(); v_authorized boolean:=false; v_prompt uuid; v_flow uuid; v_target uuid;
 v_version integer; v_old_version uuid; v_affected integer:=0; v_message text; v_diff jsonb:='{}'::jsonb;
 v_name text; v_content text; v_description text; v_slot text; v_changelog text; v_nodes jsonb; v_edges jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='UNAUTHENTICATED';END IF;
 SELECT public.has_role(v_actor,'super_admin'::public.app_role) OR (public.has_role(v_actor,'admin'::public.app_role) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.empresa_id=p_empresa_id AND p.ativo=true)) INTO v_authorized;
 IF NOT coalesce(v_authorized,false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_ACTION_FORBIDDEN';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orbit_feature_flags f WHERE f.empresa_id=p_empresa_id AND f.feature_key='tenant_operations_center_v1' AND f.enabled=true) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='TENANT_OPERATIONS_FEATURE_DISABLED';END IF;

 CASE p_action_type
 WHEN 'save_prompt_draft' THEN
  v_name:=nullif(btrim(p_payload->>'name'),'');v_content:=nullif(btrim(p_payload->>'content'),'');v_description:=nullif(btrim(p_payload->>'description'),'');v_slot:=p_payload->>'runtime_slot';
  IF v_name IS NULL OR length(v_name)>160 OR v_content IS NULL OR v_slot NOT IN('prompt_identidade','prompt_roteiro','prompt_regras') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_PROMPT_DRAFT';END IF;
  IF nullif(p_payload->>'prompt_id','') IS NULL THEN
   INSERT INTO public.orbit_prompt_definitions(empresa_id,name,description,runtime_slot,draft_content,draft_description,draft_updated_by,created_by)
   VALUES(p_empresa_id,v_name,v_description,v_slot,v_content,v_description,v_actor,v_actor) RETURNING id INTO v_prompt;
   v_diff:=jsonb_build_object('created',true,'runtime_slot',v_slot);
  ELSE
   v_prompt:=(p_payload->>'prompt_id')::uuid;
   SELECT jsonb_build_object('name',name,'description',description,'runtime_slot',runtime_slot,'content',draft_content) INTO v_diff FROM public.orbit_prompt_definitions WHERE id=v_prompt AND empresa_id=p_empresa_id FOR UPDATE;
   IF v_diff IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='PROMPT_NOT_FOUND';END IF;
   UPDATE public.orbit_prompt_definitions SET name=v_name,description=v_description,runtime_slot=v_slot,draft_content=v_content,draft_description=v_description,draft_updated_by=v_actor,draft_updated_at=now(),updated_at=now() WHERE id=v_prompt;
   v_diff:=jsonb_build_object('before',v_diff,'after',jsonb_build_object('name',v_name,'description',v_description,'runtime_slot',v_slot,'content',v_content));
  END IF;
  v_affected:=1;v_message:='Rascunho do prompt salvo sem alterar produção.';
 WHEN 'publish_prompt_version' THEN
  v_prompt:=(p_payload->>'prompt_id')::uuid;v_changelog:=nullif(btrim(p_payload->>'changelog'),'');
  IF v_changelog IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CHANGELOG_REQUIRED';END IF;
  SELECT active_version_id,draft_content,draft_description,runtime_slot INTO v_old_version,v_content,v_description,v_slot FROM public.orbit_prompt_definitions WHERE id=v_prompt AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='PROMPT_NOT_FOUND';END IF;
  v_version:=coalesce((SELECT max(version_number)+1 FROM public.orbit_prompt_versions WHERE prompt_id=v_prompt),1);
  IF p_payload ? 'version_number' AND (p_payload->>'version_number')::integer<>v_version THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_NEXT_VERSION_NUMBER';END IF;
  UPDATE public.orbit_prompt_versions SET is_active=false WHERE prompt_id IN(SELECT id FROM public.orbit_prompt_definitions WHERE empresa_id=p_empresa_id AND runtime_slot=v_slot) AND is_active;
  UPDATE public.orbit_prompt_definitions SET active_version_id=NULL,is_runtime_active=false WHERE empresa_id=p_empresa_id AND runtime_slot=v_slot;
  INSERT INTO public.orbit_prompt_versions(empresa_id,prompt_id,version_number,content,description,changelog,is_active,published_by) VALUES(p_empresa_id,v_prompt,v_version,v_content,v_description,v_changelog,true,v_actor) RETURNING id INTO v_target;
  UPDATE public.orbit_prompt_definitions SET active_version_id=v_target,is_runtime_active=true,updated_at=now() WHERE id=v_prompt;
  EXECUTE format('UPDATE public.orbit_ai_config SET %I=$1,updated_at=now() WHERE empresa_id=$2',v_slot) USING v_content,p_empresa_id;
  GET DIAGNOSTICS v_affected=ROW_COUNT; IF v_affected=0 THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='AI_CONFIG_NOT_FOUND';END IF;
  v_diff:=jsonb_build_object('from_version_id',v_old_version,'to_version_id',v_target,'version_number',v_version);v_message:='Nova versão do prompt publicada.';
 WHEN 'rollback_prompt_version' THEN
  v_prompt:=(p_payload->>'prompt_id')::uuid;v_target:=(p_payload->>'target_version_id')::uuid;
  SELECT d.active_version_id,v.content,d.runtime_slot INTO v_old_version,v_content,v_slot FROM public.orbit_prompt_definitions d JOIN public.orbit_prompt_versions v ON v.prompt_id=d.id WHERE d.id=v_prompt AND d.empresa_id=p_empresa_id AND v.id=v_target FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='PROMPT_VERSION_NOT_FOUND';END IF;
  UPDATE public.orbit_prompt_versions SET is_active=false WHERE prompt_id IN(SELECT id FROM public.orbit_prompt_definitions WHERE empresa_id=p_empresa_id AND runtime_slot=v_slot) AND is_active;
  UPDATE public.orbit_prompt_versions SET is_active=true WHERE id=v_target;
  UPDATE public.orbit_prompt_definitions SET active_version_id=NULL,is_runtime_active=false WHERE empresa_id=p_empresa_id AND runtime_slot=v_slot;
  UPDATE public.orbit_prompt_definitions SET active_version_id=v_target,is_runtime_active=true,draft_content=v_content,draft_updated_by=v_actor,draft_updated_at=now(),updated_at=now() WHERE id=v_prompt;
  EXECUTE format('UPDATE public.orbit_ai_config SET %I=$1,updated_at=now() WHERE empresa_id=$2',v_slot) USING v_content,p_empresa_id;
  GET DIAGNOSTICS v_affected=ROW_COUNT;v_diff:=jsonb_build_object('from_version_id',v_old_version,'to_version_id',v_target);v_message:='Rollback do prompt aplicado imediatamente.';
 WHEN 'save_flow_draft' THEN
  v_name:=nullif(btrim(p_payload->>'name'),'');v_nodes:=p_payload->'nodes_schema';v_edges:=p_payload->'edges_schema';v_changelog:=nullif(btrim(p_payload->>'changelog'),'');
  IF v_name IS NULL OR length(v_name)>160 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_FLOW_NAME';END IF;PERFORM public.orbit_validate_flow_schemas(v_nodes,v_edges);
  IF nullif(p_payload->>'flow_id','') IS NULL THEN
   INSERT INTO public.orbit_flows(empresa_id,nome,trigger_type,trigger_config,condicoes,ativo,created_by)
   VALUES(p_empresa_id,v_name,(v_nodes->>'trigger_type')::public.orbit_flow_trigger_type,coalesce(v_nodes->'trigger_config','{}'::jsonb),coalesce(v_nodes->'conditions','{}'::jsonb),false,v_actor) RETURNING id INTO v_flow;
   v_diff:=jsonb_build_object('created',true);
  ELSE v_flow:=(p_payload->>'flow_id')::uuid;IF NOT EXISTS(SELECT 1 FROM public.orbit_flows WHERE id=v_flow AND empresa_id=p_empresa_id) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FLOW_NOT_FOUND';END IF;END IF;
  INSERT INTO public.orbit_flow_drafts(flow_id,empresa_id,name,nodes_schema,edges_schema,changelog,updated_by,updated_at) VALUES(v_flow,p_empresa_id,v_name,v_nodes,v_edges,v_changelog,v_actor,now())
  ON CONFLICT(flow_id) DO UPDATE SET name=excluded.name,nodes_schema=excluded.nodes_schema,edges_schema=excluded.edges_schema,changelog=excluded.changelog,updated_by=excluded.updated_by,updated_at=now();
  v_affected:=1;v_message:='Rascunho do fluxo salvo sem alterar produção.';
 WHEN 'publish_flow_version' THEN
  v_flow:=(p_payload->>'flow_id')::uuid;v_changelog:=nullif(btrim(p_payload->>'changelog'),'');IF v_changelog IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CHANGELOG_REQUIRED';END IF;
  SELECT name,nodes_schema,edges_schema INTO v_name,v_nodes,v_edges FROM public.orbit_flow_drafts WHERE flow_id=v_flow AND empresa_id=p_empresa_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FLOW_DRAFT_NOT_FOUND';END IF;
  SELECT id INTO v_old_version FROM public.orbit_flow_versions WHERE flow_id=v_flow AND is_active;
  v_version:=coalesce((SELECT max(version_number)+1 FROM public.orbit_flow_versions WHERE flow_id=v_flow),1);
  UPDATE public.orbit_flow_versions SET is_active=false WHERE flow_id=v_flow AND is_active;
  INSERT INTO public.orbit_flow_versions(empresa_id,flow_id,version_number,name,nodes_schema,edges_schema,changelog,is_active,published_by) VALUES(p_empresa_id,v_flow,v_version,v_name,v_nodes,v_edges,v_changelog,true,v_actor) RETURNING id INTO v_target;
  v_affected:=public.orbit_apply_flow_version(p_empresa_id,v_flow,v_name,v_nodes,v_edges);v_diff:=jsonb_build_object('from_version_id',v_old_version,'to_version_id',v_target,'version_number',v_version);v_message:='Nova versão do fluxo publicada.';
 WHEN 'rollback_flow_version' THEN
  v_flow:=(p_payload->>'flow_id')::uuid;v_target:=(p_payload->>'target_version_id')::uuid;
  SELECT name,nodes_schema,edges_schema INTO v_name,v_nodes,v_edges FROM public.orbit_flow_versions WHERE id=v_target AND flow_id=v_flow AND empresa_id=p_empresa_id;IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='FLOW_VERSION_NOT_FOUND';END IF;
  SELECT id INTO v_old_version FROM public.orbit_flow_versions WHERE flow_id=v_flow AND is_active;
  UPDATE public.orbit_flow_versions SET is_active=false WHERE flow_id=v_flow AND is_active;
  UPDATE public.orbit_flow_versions SET is_active=true WHERE id=v_target;
  INSERT INTO public.orbit_flow_drafts(flow_id,empresa_id,name,nodes_schema,edges_schema,changelog,updated_by,updated_at) VALUES(v_flow,p_empresa_id,v_name,v_nodes,v_edges,'Rollback',v_actor,now()) ON CONFLICT(flow_id) DO UPDATE SET name=excluded.name,nodes_schema=excluded.nodes_schema,edges_schema=excluded.edges_schema,changelog=excluded.changelog,updated_by=excluded.updated_by,updated_at=now();
  v_affected:=public.orbit_apply_flow_version(p_empresa_id,v_flow,v_name,v_nodes,v_edges);v_diff:=jsonb_build_object('from_version_id',v_old_version,'to_version_id',v_target);v_message:='Rollback do fluxo aplicado imediatamente.';
 ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_CONTENT_ACTION';END CASE;

 INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes) VALUES(p_empresa_id,v_actor,p_action_type,CASE WHEN p_action_type LIKE '%prompt%' THEN 'orbit_prompt_versions' ELSE 'orbit_flow_versions' END,coalesce(v_prompt,v_flow),jsonb_build_object('tenant_slug',p_tenant_slug,'payload',p_payload,'diff',v_diff,'affected_rows',v_affected,'source','tenant_operations_center_v3_part2'));
 RETURN jsonb_strip_nulls(jsonb_build_object('ok',true,'action',p_action_type,'affected_rows',v_affected,'entity_id',coalesce(v_prompt,v_flow),'version_id',v_target,'version_number',v_version,'message',v_message));
END;
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_content_action(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) RENAME TO orbit_tenant_ops_action_phase3_part1;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action_phase3_part1(text,text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.orbit_tenant_ops_action(p_tenant_slug text,p_action_type text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_empresa uuid;
BEGIN
 IF p_action_type IN('save_prompt_draft','publish_prompt_version','rollback_prompt_version','save_flow_draft','publish_flow_version','rollback_flow_version') THEN
  SELECT id INTO v_empresa FROM public.orbit_empresas WHERE slug=p_tenant_slug AND ativo=true;
  IF v_empresa IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='TENANT_NOT_FOUND';END IF;
  RETURN public.orbit_tenant_ops_content_action(v_empresa,p_tenant_slug,p_action_type,coalesce(p_payload,'{}'::jsonb));
 END IF;
 RETURN public.orbit_tenant_ops_action_phase3_part1(p_tenant_slug,p_action_type,p_payload);
END;
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_action(text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_prompts_flows_read(p_empresa_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $function$
 SELECT jsonb_build_object(
  'prompts',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',d.id,'name',d.name,'description',d.description,'runtime_slot',d.runtime_slot,'draft_content',d.draft_content,'draft_description',d.draft_description,
    'status',CASE WHEN d.active_version_id IS NULL THEN 'draft' WHEN av.content IS DISTINCT FROM d.draft_content THEN 'draft' ELSE 'published' END,
    'active_version_id',d.active_version_id,'active_version_number',av.version_number,
    'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'is_active',v.is_active,'changelog',v.changelog,'published_at',v.published_at,'published_by',v.published_by,'author_name',p.nome) ORDER BY v.version_number DESC) FROM public.orbit_prompt_versions v LEFT JOIN public.profiles p ON p.id=v.published_by WHERE v.prompt_id=d.id),'[]'::jsonb)
  ) ORDER BY d.runtime_slot) FROM public.orbit_prompt_definitions d LEFT JOIN public.orbit_prompt_versions av ON av.id=d.active_version_id WHERE d.empresa_id=p_empresa_id),'[]'::jsonb),
  'flows',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',f.id,'name',coalesce(d.name,f.nome),'status',CASE WHEN av.id IS NULL THEN 'draft' WHEN av.nodes_schema IS DISTINCT FROM d.nodes_schema OR av.edges_schema IS DISTINCT FROM d.edges_schema OR av.name IS DISTINCT FROM d.name THEN 'draft' ELSE 'published' END,
    'active',f.ativo,'nodes_schema',d.nodes_schema,'edges_schema',d.edges_schema,'active_version_id',av.id,'active_version_number',av.version_number,
    'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'is_active',v.is_active,'changelog',v.changelog,'published_at',v.published_at,'published_by',v.published_by,'author_name',p.nome) ORDER BY v.version_number DESC) FROM public.orbit_flow_versions v LEFT JOIN public.profiles p ON p.id=v.published_by WHERE v.flow_id=f.id),'[]'::jsonb)
  ) ORDER BY f.created_at DESC) FROM public.orbit_flows f JOIN public.orbit_flow_drafts d ON d.flow_id=f.id LEFT JOIN public.orbit_flow_versions av ON av.flow_id=f.id AND av.is_active WHERE f.empresa_id=p_empresa_id AND f.deleted_at IS NULL),'[]'::jsonb)
 );
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_prompts_flows_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_prompts_flows_read(uuid) TO authenticated;

ALTER FUNCTION public.orbit_tenant_ops_read(text) RENAME TO orbit_tenant_ops_read_phase3_part1;
CREATE FUNCTION public.orbit_tenant_ops_read(p_section text DEFAULT 'summary'::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $function$
DECLARE v_base jsonb;v_empresa uuid;v_content jsonb;
BEGIN
 SELECT empresa_id INTO v_empresa FROM public.profiles WHERE id=auth.uid() AND ativo=true;
 IF v_empresa IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='TENANT_CONTEXT_MISSING';END IF;
 v_base:=public.orbit_tenant_ops_read_phase3_part1(CASE WHEN p_section='prompts_flows' THEN 'summary' ELSE p_section END);
 v_content:=public.orbit_tenant_ops_prompts_flows_read(v_empresa);
 RETURN jsonb_set(v_base,'{data,prompts_flows}',v_content,true);
END;
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_read(text) TO authenticated;
