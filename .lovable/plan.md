

# Filtros avançados, seleção individual e grupos de envio para campanhas

## Visão geral

Expandir o Step 3 (Destinatários) do CampaignWizard com três modos de seleção: filtros avançados, seleção individual de prospects, e grupos de envio reutilizáveis.

## 1. Nova tabela: `orbit_send_groups`

Criar via migração SQL:

```sql
CREATE TABLE orbit_send_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  prospect_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orbit_send_groups ENABLE ROW LEVEL SECURITY;

-- SELECT para membros da empresa
CREATE POLICY "Users can view own empresa groups" ON orbit_send_groups
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- INSERT/UPDATE/DELETE para membros Orbit
CREATE POLICY "PE members can manage own empresa groups" ON orbit_send_groups
  FOR ALL TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()))
  WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

-- Super admin
CREATE POLICY "Super admin full access groups" ON orbit_send_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));
```

## 2. Hook `useOrbitSendGroups.ts`

CRUD para `orbit_send_groups`: `useOrbitSendGroups()`, `useCreateSendGroup()`, `useUpdateSendGroup()`, `useDeleteSendGroup()`.

## 3. Reformular Step 3 do CampaignWizard

### Três abas no step de destinatários:

**Aba "Filtros"** (modo padrão, expandido):
- Status de qualificação (checkboxes) -- já existe
- Segmento (dropdown com valores distintos dos prospects)
- Cidade (input, já existe)
- Estado (dropdown com valores distintos)
- Origem do contato (`origem_contato`)
- Origem do lead (`origem_lead`)
- Tags (multi-select com valores distintos)
- Score mínimo (slider ou input numérico)
- Responsável (dropdown com profiles da empresa)
- Consentimento (checkbox: apenas com consentimento email/whatsapp)

**Aba "Seleção Individual"**:
- Lista de prospects com busca, checkbox por prospect
- Exibe nome, email/telefone, status
- Botão "Selecionar todos" / "Limpar seleção"
- Os prospects selecionados individualmente são adicionados como recipients

**Aba "Grupos"**:
- Lista de grupos existentes com checkbox para selecionar
- Botão "Criar Grupo" inline: nome + seleção de prospects (modal simples)
- Ao selecionar um grupo, seus prospects são incluídos como recipients

### Lógica de combinação:
- Os três modos são cumulativos: prospects dos filtros + selecionados individualmente + dos grupos selecionados, sem duplicatas

## 4. Atualizar `CampaignData`

```typescript
interface CampaignData {
  // ...existente...
  filtros: {
    status_qualificacao?: string[];
    segmento?: string;
    cidade?: string;
    estado?: string;
    origem_contato?: string;
    origem_lead?: string;
    tags?: string[];
    score_min?: number;
    responsavel_id?: string;
    apenas_consentimento?: boolean;
  };
  selected_prospect_ids?: string[];
  selected_group_ids?: string[];
}
```

## 5. Atualizar `calculateRecipients` e `handleCreate`

- Aplicar todos os novos filtros
- Unir com prospects selecionados individualmente e dos grupos
- Deduplicar por `prospect.id`
- Criar recipients com a lista final

## 6. Arquivos afetados

| Arquivo | Ação |
|---------|------|
| **Migração SQL** | Criar tabela `orbit_send_groups` com RLS |
| `src/hooks/useOrbitSendGroups.ts` | Novo hook CRUD |
| `src/components/orbit/CampaignWizard.tsx` | Reformular Step 3 com 3 abas, filtros expandidos, seleção individual, grupos |

