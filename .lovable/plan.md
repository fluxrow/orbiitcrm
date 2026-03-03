

# Botão "Testar Conexão" inativo na Z-API

## Causa raiz

O problema **não é** o botão em si — ele fica desabilitado quando `instance_id` e `token` estão vazios. A causa real é que o usuário **não consegue salvar** a configuração da Z-API porque a política RLS de escrita usa `has_role(auth.uid(), 'admin')` (sistema legado), que não está sincronizando corretamente com os papéis PE.

Os logs do banco confirmam: `new row violates row-level security policy for table "orbit_zapi_config"` — repetido múltiplas vezes.

## Correções necessárias

### 1. Migrar RLS da `orbit_zapi_config` para usar papéis PE nativos
Mesmo padrão aplicado nas tabelas de templates/campaigns/prospects:

- DROP policy "Admins can manage own empresa zapi_config" (usa `has_role` legado)
- CREATE nova policy usando `pe_user_is_orbit_admin(auth.uid())` + `empresa_id = get_user_empresa_id(auth.uid())`

### 2. Corrigir hook `useOrbitZAPIConfig` para filtrar por `empresa_id`
O hook atual faz `.maybeSingle()` sem filtro de empresa. Precisa receber `empresaId` e filtrar por ele, igual ao `useOrbitAIConfig`.

### 3. Corrigir `useUpdateZAPIConfig` para incluir `empresa_id`
O hook de update/insert também não usa `empresa_id`, causando violação da política RLS que exige match de empresa.

### Detalhes técnicos

**Migração SQL:**
```sql
DROP POLICY "Admins can manage own empresa zapi_config" ON orbit_zapi_config;
CREATE POLICY "Orbit admins can manage own empresa zapi_config"
  ON orbit_zapi_config FOR ALL TO authenticated
  USING (pe_user_is_orbit_admin(auth.uid()) AND empresa_id = get_user_empresa_id(auth.uid()))
  WITH CHECK (pe_user_is_orbit_admin(auth.uid()) AND empresa_id = get_user_empresa_id(auth.uid()));
```

**Hook `useOrbitZAPIConfig`:** Adicionar parâmetro `empresaId` e filtrar `.eq("empresa_id", empresaId)`.

**Hook `useUpdateZAPIConfig`:** Receber e incluir `empresa_id` no insert/update, similar ao `useUpdateAIConfig`.

