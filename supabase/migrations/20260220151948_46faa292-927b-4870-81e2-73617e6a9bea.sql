
-- Add UNIQUE constraints for idempotent seeding
ALTER TABLE produtos ADD CONSTRAINT uq_produtos_org_codigo UNIQUE (organization_id, codigo);
ALTER TABLE funil_etapas ADD CONSTRAINT uq_funil_etapas_org_nome UNIQUE (organization_id, nome);

-- Create pe_provision_tenant RPC
CREATE OR REPLACE FUNCTION public.pe_provision_tenant(
  p_empresa_id uuid,
  p_empresa_nome text,
  p_created_by_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_seeded boolean := false;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM pe_tenant_map WHERE empresa_id = p_empresa_id;

  IF v_org_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'empresa_id', p_empresa_id,
      'organization_id', v_org_id,
      'seeded', false
    );
  END IF;

  INSERT INTO organizations (name)
  VALUES (p_empresa_nome)
  RETURNING id INTO v_org_id;

  INSERT INTO pe_tenant_map (empresa_id, organization_id)
  VALUES (p_empresa_id, v_org_id);

  INSERT INTO produtos (organization_id, codigo, nome, categoria) VALUES
    (v_org_id, 'AEREO', 'Aereo', 'TRANSPORTE'),
    (v_org_id, 'RODOVIARIO', 'Rodoviario', 'TRANSPORTE'),
    (v_org_id, 'LOCACAO_VEICULO', 'Locacao de Veiculo', 'TRANSPORTE'),
    (v_org_id, 'TRANSFER', 'Transfer', 'TRANSPORTE'),
    (v_org_id, 'HOSPEDAGEM', 'Hospedagem', 'HOSPEDAGEM'),
    (v_org_id, 'SEGURO', 'Seguro Viagem', 'PROTECAO'),
    (v_org_id, 'EVENTOS', 'Eventos', 'EVENTOS')
  ON CONFLICT (organization_id, codigo) DO NOTHING;

  INSERT INTO funil_etapas (organization_id, nome, ordem, tipo) VALUES
    (v_org_id, 'Solicitacao Recebida', 1, 'open'),
    (v_org_id, 'Em Qualificacao', 2, 'open'),
    (v_org_id, 'Cotacao Enviada', 3, 'open'),
    (v_org_id, 'Ajustes / Negociacao', 4, 'open'),
    (v_org_id, 'Emitido / Confirmado', 5, 'won'),
    (v_org_id, 'Perdido / Cancelado', 6, 'lost')
  ON CONFLICT (organization_id, nome) DO NOTHING;

  v_seeded := true;

  INSERT INTO pe_audit_log (
    organization_id, actor_user_id, action, entity_type, metadata
  ) VALUES (
    v_org_id, p_created_by_user_id, 'TENANT_PROVISIONED', 'pe_tenant_map',
    jsonb_build_object(
      'empresa_id', p_empresa_id,
      'organization_id', v_org_id,
      'seeded', v_seeded
    )
  );

  RETURN jsonb_build_object(
    'empresa_id', p_empresa_id,
    'organization_id', v_org_id,
    'seeded', v_seeded
  );
END;
$$;
