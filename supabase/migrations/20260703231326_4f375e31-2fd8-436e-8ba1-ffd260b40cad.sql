
CREATE OR REPLACE FUNCTION public.apply_stage_followup(p_empresa uuid, p_stage uuid, p_template jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_stage record;
  v_titulo text;
  v_dias int;
BEGIN
  SELECT * INTO v_stage FROM public.orbit_pipeline_stages
    WHERE id = p_stage AND empresa_id = p_empresa;
  IF v_stage IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;

  v_titulo := COALESCE(p_template->>'titulo', 'Follow-up automático — ' || v_stage.nome);
  v_dias := COALESCE((p_template->>'dias_prazo')::int, 3);

  v_before := jsonb_build_object('stage_id', p_stage, 'existing_followups', (
    SELECT count(*) FROM public.orbit_tasks
     WHERE empresa_id = p_empresa AND titulo = v_titulo
  ));

  INSERT INTO public.orbit_tasks (empresa_id, titulo, descricao, status, prioridade, tipo_tarefa, due_date)
  VALUES (p_empresa, v_titulo,
    COALESCE(p_template->>'descricao', 'Follow-up sugerido pelo Advisor para a etapa ' || v_stage.nome),
    'pendente', 'media', 'follow_up', (now() + make_interval(days => v_dias))::date)
  RETURNING jsonb_build_object('id', id, 'titulo', titulo, 'due_date', due_date) INTO v_after;

  RETURN jsonb_build_object(
    'ok', true,
    'target_table', 'orbit_tasks',
    'target_id', p_stage,
    'before', v_before,
    'after', v_after
  );
END;
$$;
