-- Wave 4.3b: tenant-scoped campaign administration. Real dispatch is excluded.
BEGIN;

INSERT INTO public.orbit_feature_flags(empresa_id, feature_key, enabled, enabled_at, rollout_metadata)
SELECT e.id, 'tenant_campaign_mutations_wave4_v1', e.slug='fluxrow',
       CASE WHEN e.slug='fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary',e.slug='fluxrow','wave','4.3b','real_dispatch',false)
FROM public.orbit_empresas e
WHERE e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(x.slug ORDER BY x.slug) INTO v_invalid
  FROM (VALUES ('fluxrow',true),('bullink-negocios',false),
               ('fabrica-de-pesquisadores',false),('viver-semijoias',false)) x(slug,enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug=x.slug
  LEFT JOIN public.orbit_feature_flags f ON f.empresa_id=e.id AND f.feature_key='tenant_campaign_mutations_wave4_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM x.enabled;
  IF v_invalid IS NOT NULL THEN RAISE EXCEPTION 'TENANT_CAMPAIGN_MUTATION_ROLLOUT_MISMATCH: %',v_invalid; END IF;
END $guard$;

-- Restore the server-side preview contract found in Git but absent from Cloud,
-- replacing persisted-profile authorization with explicit membership access.
CREATE OR REPLACE FUNCTION public.preview_campaign_recipients(
  p_empresa_id uuid, p_canal text, p_filtros jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  prospect_id uuid,nome_razao text,nome_fantasia text,email_principal text,
  whatsapp text,telefone text,status_qualificacao text,segmento text,cidade text,total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $preview$
  WITH authorized AS (
    SELECT 1 WHERE auth.uid() IS NOT NULL AND public.user_has_empresa_access(p_empresa_id)
  ), manual_ids AS (
    SELECT value::uuid prospect_id
    FROM jsonb_array_elements_text(coalesce(p_filtros->'selected_prospect_ids','[]'::jsonb))
    UNION
    SELECT unnest(g.prospect_ids)
    FROM public.orbit_send_groups g, authorized
    WHERE g.empresa_id=p_empresa_id AND g.id IN (
      SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_filtros->'selected_group_ids','[]'::jsonb))
    )
  ), filtered_ids AS (
    SELECT p.id prospect_id
    FROM public.orbit_prospects p, authorized
    WHERE p.empresa_id=p_empresa_id AND p.deleted_at IS NULL
      AND (coalesce(jsonb_array_length(p_filtros->'tags'),0)=0 OR p.tags && ARRAY(SELECT jsonb_array_elements_text(p_filtros->'tags')))
      AND (coalesce(jsonb_array_length(p_filtros->'status_qualificacao'),0)=0 OR p.status_qualificacao=ANY(ARRAY(SELECT jsonb_array_elements_text(p_filtros->'status_qualificacao'))))
      AND (nullif(p_filtros->>'segmento','') IS NULL OR p.segmento=p_filtros->>'segmento')
      AND (nullif(p_filtros->>'cidade','') IS NULL OR p.cidade ILIKE '%'||(p_filtros->>'cidade')||'%')
      AND (nullif(p_filtros->>'estado','') IS NULL OR p.estado=p_filtros->>'estado')
      AND (nullif(p_filtros->>'origem_contato','') IS NULL OR p.origem_contato=p_filtros->>'origem_contato')
      AND (nullif(p_filtros->>'origem_lead','') IS NULL OR p.origem_lead=p_filtros->>'origem_lead')
      AND (nullif(p_filtros->>'score_min','') IS NULL OR coalesce(p.score,0)>=(p_filtros->>'score_min')::integer)
      AND (nullif(p_filtros->>'responsavel_id','') IS NULL OR p.responsavel_id=(p_filtros->>'responsavel_id')::uuid)
      AND (nullif(p_filtros->>'tipo','') IS NULL OR p.tipo=p_filtros->>'tipo')
      AND (NOT coalesce((p_filtros->>'tem_email')::boolean,false) OR nullif(p.email_principal,'') IS NOT NULL)
      AND (NOT coalesce((p_filtros->>'tem_telefone')::boolean,false) OR nullif(coalesce(p.whatsapp,p.telefone),'') IS NOT NULL)
      AND (nullif(p_filtros->>'excluir_campanha_id','') IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.orbit_campaign_recipients r WHERE r.empresa_id=p_empresa_id AND r.campaign_id=(p_filtros->>'excluir_campanha_id')::uuid AND r.prospect_id=p.id))
      AND (nullif(p_filtros->>'apenas_abriu_campanha_id','') IS NULL OR EXISTS (
        SELECT 1 FROM public.orbit_campaign_recipients r WHERE r.empresa_id=p_empresa_id AND r.campaign_id=(p_filtros->>'apenas_abriu_campanha_id')::uuid AND r.prospect_id=p.id AND r.opened_at IS NOT NULL))
      AND (nullif(p_filtros->>'nao_abriu_campanha_id','') IS NULL OR (
        EXISTS (SELECT 1 FROM public.orbit_campaign_recipients r WHERE r.empresa_id=p_empresa_id AND r.campaign_id=(p_filtros->>'nao_abriu_campanha_id')::uuid AND r.prospect_id=p.id)
        AND NOT EXISTS (SELECT 1 FROM public.orbit_campaign_recipients r WHERE r.empresa_id=p_empresa_id AND r.campaign_id=(p_filtros->>'nao_abriu_campanha_id')::uuid AND r.prospect_id=p.id AND r.opened_at IS NOT NULL)))
  ), combined AS (
    SELECT prospect_id FROM filtered_ids UNION SELECT prospect_id FROM manual_ids
  ), eligible AS (
    SELECT p.* FROM public.orbit_prospects p JOIN combined c ON c.prospect_id=p.id
    WHERE p.empresa_id=p_empresa_id AND p.deleted_at IS NULL
      AND (p_canal<>'email' OR (nullif(p.email_principal,'') IS NOT NULL AND NOT coalesce(p.optout_email,false)
        AND (NOT coalesce((p_filtros->>'apenas_consentimento')::boolean,false) OR coalesce(p.consentimento_email,false))))
      AND (p_canal='email' OR (nullif(coalesce(p.whatsapp,p.telefone),'') IS NOT NULL AND NOT coalesce(p.optout_whatsapp,false)
        AND (NOT coalesce((p_filtros->>'apenas_consentimento')::boolean,false) OR coalesce(p.consentimento_whatsapp,false))))
  ), numbered AS (
    SELECT e.*,count(*) over() total_count,row_number() over(order by coalesce(e.nome_razao,e.nome_fantasia,''),e.created_at desc nulls last) rn
    FROM eligible e
  )
  SELECT n.id,n.nome_razao,n.nome_fantasia,n.email_principal,n.whatsapp,n.telefone,
         n.status_qualificacao,n.segmento,n.cidade,n.total_count
  FROM numbered n
  WHERE n.rn>(greatest(coalesce(p_page,1),1)-1)*greatest(coalesce(p_page_size,25),1)
    AND n.rn<=greatest(coalesce(p_page,1),1)*greatest(coalesce(p_page_size,25),1)
  ORDER BY n.rn;
$preview$;

REVOKE ALL ON FUNCTION public.preview_campaign_recipients(uuid,text,jsonb,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_campaign_recipients(uuid,text,jsonb,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_mutate_scoped(
  p_tenant_slug text,
  p_action_type text,
  p_campaign_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_campaign public.orbit_campaigns%ROWTYPE;
  v_result jsonb;
  v_populate jsonb;
  v_expected integer;
  v_total integer;
  v_template_id uuid;
  v_status text;
  v_filters jsonb;
  v_manual_only boolean;
  v_inserted integer;
BEGIN
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug, 'tenant_campaign_mutations_wave4_v1'
  );
  p_payload := coalesce(p_payload,'{}'::jsonb);
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PAYLOAD_OBJECT_REQUIRED';
  END IF;
  IF p_action_type = 'dispatch_campaign' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REAL_DISPATCH_NOT_ALLOWED';
  END IF;

  IF p_action_type = 'save_draft' AND p_campaign_id IS NULL THEN
    IF nullif(btrim(p_payload->>'nome'),'') IS NULL OR p_payload->>'canal' NOT IN ('email','whatsapp') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_DRAFT';
    END IF;
    v_template_id := nullif(p_payload->>'template_id','')::uuid;
    IF v_template_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.orbit_message_templates t
      WHERE t.id=v_template_id AND (t.empresa_id=v_empresa_id OR t.empresa_id IS NULL)
    ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_TEMPLATE'; END IF;

    INSERT INTO public.orbit_campaigns(
      empresa_id,created_by,nome,canal,publico_origem,template_id,filtros_json,
      agendada_para,status,total_destinatarios,whatsapp_cta_override,
      whatsapp_cta_enabled,whatsapp_cta_numero,whatsapp_cta_texto_botao,
      whatsapp_cta_mensagem_inicial,whatsapp_cta_posicao
    ) VALUES (
      v_empresa_id,v_uid,btrim(p_payload->>'nome'),p_payload->>'canal',
      coalesce(nullif(p_payload->>'publico_origem',''),'prospects'),v_template_id,
      coalesce(p_payload->'filtros_json','{}'::jsonb),nullif(p_payload->>'agendada_para','')::timestamptz,
      CASE WHEN nullif(p_payload->>'agendada_para','') IS NULL THEN 'rascunho' ELSE 'agendada' END,
      0,coalesce((p_payload->>'whatsapp_cta_override')::boolean,false),
      (p_payload->>'whatsapp_cta_enabled')::boolean,nullif(p_payload->>'whatsapp_cta_numero',''),
      nullif(p_payload->>'whatsapp_cta_texto_botao',''),nullif(p_payload->>'whatsapp_cta_mensagem_inicial',''),
      nullif(p_payload->>'whatsapp_cta_posicao','')
    ) RETURNING * INTO v_campaign;
  ELSE
    IF p_campaign_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CAMPAIGN_ID_REQUIRED'; END IF;
    SELECT * INTO v_campaign FROM public.orbit_campaigns c
    WHERE c.id=p_campaign_id AND c.empresa_id=v_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='CAMPAIGN_NOT_FOUND'; END IF;

    IF p_action_type = 'save_draft' THEN
      IF v_campaign.status NOT IN ('rascunho','em_revisao','agendada') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CAMPAIGN_NOT_EDITABLE';
      END IF;
      UPDATE public.orbit_campaigns c SET
        nome=coalesce(nullif(btrim(p_payload->>'nome'),''),c.nome),
        filtros_json=coalesce(p_payload->'filtros_json',c.filtros_json),
        template_id=coalesce(nullif(p_payload->>'template_id','')::uuid,c.template_id),
        agendada_para=CASE WHEN p_payload ? 'agendada_para' THEN nullif(p_payload->>'agendada_para','')::timestamptz ELSE c.agendada_para END,
        updated_at=now()
      WHERE c.id=p_campaign_id AND c.empresa_id=v_empresa_id RETURNING * INTO v_campaign;
    ELSIF p_action_type = 'populate_recipients' THEN
      IF v_campaign.status NOT IN ('rascunho','em_revisao','agendada') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CAMPAIGN_RECIPIENTS_LOCKED';
      END IF;
      v_filters := coalesce(v_campaign.filtros_json,'{}'::jsonb);
      v_manual_only := (
        coalesce(jsonb_array_length(v_filters->'selected_prospect_ids'),0)>0
        OR coalesce(jsonb_array_length(v_filters->'selected_group_ids'),0)>0
      ) AND jsonb_strip_nulls(v_filters-'selected_prospect_ids'-'selected_group_ids')='{}'::jsonb;
      WITH manual_ids AS (
        SELECT value::uuid prospect_id
        FROM jsonb_array_elements_text(coalesce(v_filters->'selected_prospect_ids','[]'::jsonb))
        UNION
        SELECT unnest(g.prospect_ids)
        FROM public.orbit_send_groups g
        WHERE g.empresa_id=v_empresa_id AND g.id IN (
          SELECT value::uuid FROM jsonb_array_elements_text(coalesce(v_filters->'selected_group_ids','[]'::jsonb))
        )
      ), manual_eligible AS (
        SELECT p.id prospect_id,p.email_principal,coalesce(p.whatsapp,p.telefone) telefone
        FROM public.orbit_prospects p JOIN manual_ids m ON m.prospect_id=p.id
        WHERE v_manual_only AND p.empresa_id=v_empresa_id AND p.deleted_at IS NULL
          AND (v_campaign.canal<>'email' OR (nullif(p.email_principal,'') IS NOT NULL AND coalesce(p.optout_email,false)=false))
          AND (v_campaign.canal='email' OR (nullif(coalesce(p.whatsapp,p.telefone),'') IS NOT NULL AND coalesce(p.optout_whatsapp,false)=false))
      ), preview_eligible AS (
        SELECT p.prospect_id,p.email_principal,coalesce(p.whatsapp,p.telefone) telefone
        FROM public.preview_campaign_recipients(v_empresa_id,v_campaign.canal,v_filters,1,2147483647) p
        WHERE NOT v_manual_only
      ), eligible AS (
        SELECT * FROM manual_eligible UNION SELECT * FROM preview_eligible
      ), ins AS (
        INSERT INTO public.orbit_campaign_recipients(campaign_id,empresa_id,prospect_id,email,telefone,status)
        SELECT p_campaign_id,v_empresa_id,e.prospect_id,e.email_principal,e.telefone,'pendente'
        FROM eligible e
        ON CONFLICT (campaign_id,prospect_id) WHERE campaign_id IS NOT NULL AND prospect_id IS NOT NULL DO NOTHING
        RETURNING 1
      ) SELECT count(*) INTO v_inserted FROM ins;
      SELECT count(*) INTO v_total FROM public.orbit_campaign_recipients
      WHERE campaign_id=p_campaign_id AND empresa_id=v_empresa_id;
      UPDATE public.orbit_campaigns SET total_destinatarios=v_total,updated_at=now()
      WHERE id=p_campaign_id AND empresa_id=v_empresa_id;
      v_populate := jsonb_build_object('inserted',v_inserted,'total',v_total,'manual_only',v_manual_only);
      v_expected := nullif(p_payload->>'expected_recipient_count','')::integer;
      IF v_expected IS NOT NULL AND v_total <> v_expected THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CAMPAIGN_RECIPIENT_COUNT_MISMATCH';
      END IF;
    ELSIF p_action_type = 'mark_in_review' THEN
      IF v_campaign.status <> 'rascunho' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_TRANSITION'; END IF;
      UPDATE public.orbit_campaigns SET status='em_revisao',updated_at=now()
      WHERE id=p_campaign_id AND empresa_id=v_empresa_id RETURNING * INTO v_campaign;
    ELSIF p_action_type = 'approve_campaign' THEN
      IF v_campaign.status NOT IN ('rascunho','em_revisao','agendada') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_TRANSITION'; END IF;
      SELECT count(*) INTO v_total FROM public.orbit_campaign_recipients
      WHERE campaign_id=p_campaign_id AND empresa_id=v_empresa_id AND status='pendente';
      IF v_total=0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CAMPAIGN_HAS_NO_PENDING_RECIPIENTS'; END IF;
      v_status := CASE WHEN coalesce((p_payload->>'dispatch_approval_only')::boolean,false)
        THEN v_campaign.status ELSE 'aprovada_para_envio' END;
      UPDATE public.orbit_campaigns SET status=v_status,aprovacao_status='aprovada',
        aprovado_por=v_uid,aprovado_em=now(),updated_at=now()
      WHERE id=p_campaign_id AND empresa_id=v_empresa_id RETURNING * INTO v_campaign;
      INSERT INTO public.orbit_campaign_approvals(campaign_id,empresa_id,acao,user_id)
      VALUES(p_campaign_id,v_empresa_id,'aprovada_para_envio',v_uid);
    ELSIF p_action_type = 'pause_campaign' THEN
      IF v_campaign.status NOT IN ('agendada','enviando','aprovada_para_envio','pausada_por_limite') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_TRANSITION'; END IF;
      UPDATE public.orbit_campaigns SET status='pausada',updated_at=now()
      WHERE id=p_campaign_id AND empresa_id=v_empresa_id RETURNING * INTO v_campaign;
    ELSIF p_action_type = 'cancel_campaign' THEN
      IF v_campaign.status IN ('concluida','cancelada') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_CAMPAIGN_TRANSITION'; END IF;
      UPDATE public.orbit_campaigns SET status='cancelada',updated_at=now()
      WHERE id=p_campaign_id AND empresa_id=v_empresa_id RETURNING * INTO v_campaign;
    ELSE
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNKNOWN_CAMPAIGN_ACTION';
    END IF;
  END IF;

  SELECT to_jsonb(c) INTO v_result FROM public.orbit_campaigns c
  WHERE c.id=coalesce(p_campaign_id,v_campaign.id) AND c.empresa_id=v_empresa_id;
  INSERT INTO public.orbit_audit_log(empresa_id,user_id,acao,entidade,entidade_id,detalhes)
  VALUES(v_empresa_id,v_uid,'tenant_campaign_'||p_action_type,'orbit_campaigns',
         coalesce(p_campaign_id,v_campaign.id),jsonb_build_object(
           'tenant_slug',btrim(p_tenant_slug),'action',p_action_type,
           'payload_keys',(SELECT coalesce(jsonb_agg(k),'[]'::jsonb) FROM jsonb_object_keys(p_payload) k),
           'recipient_result',CASE WHEN p_action_type='populate_recipients' THEN v_populate ELSE NULL END
         ));
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('campaign',v_result,'recipient_result',v_populate));
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_mutate_scoped(text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_mutate_scoped(text,text,uuid,jsonb) TO authenticated;

COMMIT;
