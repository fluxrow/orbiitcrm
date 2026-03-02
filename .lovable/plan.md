

# Problema: Papéis do PE não sincronizados com permissões RLS

## Diagnóstico

O sistema tem **dois sistemas de papéis coexistindo** que não estão conectados:

1. **PE Roles** (`pe_users` + `pe_roles`): `ORG_ADMIN`, `ORG_MANAGER`, `ORG_SALES`, `ORG_SDR`, `ORG_VIEWER`
2. **Legacy Roles** (`user_roles` + `app_role` enum): `super_admin`, `admin`, `vendedor`, `visualizador`

As políticas RLS de **8 tabelas críticas** usam `has_role(auth.uid(), 'admin')` para permitir escrita, mas essa função consulta a tabela `user_roles` — não a `pe_users`.

**Estado atual da tabela `user_roles`:**
| Usuário | `pe_roles` | `user_roles` |
|---------|------------|--------------|
| Vagner Terres (60d33e2d) | ORG_ADMIN | admin ✅ |
| Cauã Farias | ORG_ADMIN | ❌ VAZIO |
| Alexandre Eifler Bock | ORG_ADMIN | ❌ VAZIO |
| Augusto Ross | ORG_ADMIN | ❌ VAZIO |
| Vagner (super admin) | — | super_admin ✅ |

**Resultado:** 3 de 4 usuários da organização não conseguem salvar templates, configurações de IA, Z-API, email, pipeline, etc. — mesmo sendo Administradores no PE.

**Tabelas afetadas** (escrita bloqueada sem role em `user_roles`):
- `orbit_ai_config`, `orbit_zapi_config`, `orbit_resend_config`
- `orbit_message_templates`, `orbit_pipeline_stages`
- `orbit_distribuicao_config`, `orbit_integrations_config`, `orbit_meta_config`

## Solução proposta

### 1. Corrigir dados existentes (SQL migration)
Inserir na `user_roles` o mapeamento correto para todos os usuários PE que não têm entrada:

```text
ORG_ADMIN   → admin
ORG_MANAGER → admin
ORG_SALES   → vendedor
ORG_SDR     → vendedor
ORG_VIEWER  → visualizador
```

### 2. Criar trigger de sincronização automática
Adicionar um trigger na tabela `pe_users` que, ao inserir ou atualizar um registro, automaticamente cria/atualiza a entrada correspondente em `user_roles` com o mapeamento de papéis acima. Isso garante que novos usuários ou mudanças de papel sejam refletidos imediatamente.

### 3. Sem alterações no frontend
O código frontend já funciona corretamente — o problema é exclusivamente no banco de dados (dados faltantes + falta de sincronização automática).

