

# Separar Telefone e WhatsApp no Orbit

## Resumo

Atualmente o campo `telefone_whatsapp` serve tanto como telefone geral quanto WhatsApp. Vamos criar um campo `whatsapp` dedicado com `whatsapp_status` para controle de validação, ajustar o import CSV, migrar dados existentes, atualizar a UI e integrar validação via Z-API.

## 1. Migration SQL — Novos campos + migração de dados

Adicionar 2 colunas à tabela `orbit_prospects`:

```sql
ALTER TABLE orbit_prospects
  ADD COLUMN whatsapp text,
  ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'nao_verificado';

-- Migrar dados existentes: se telefone_whatsapp tem 11 dígitos, copiar para whatsapp
UPDATE orbit_prospects
SET whatsapp = telefone_whatsapp,
    whatsapp_status = 'nao_verificado'
WHERE whatsapp IS NULL
  AND telefone_whatsapp IS NOT NULL
  AND length(regexp_replace(telefone_whatsapp, '[^0-9]', '', 'g')) = 11;

-- Renomear telefone_whatsapp para telefone (mais semântico)
ALTER TABLE orbit_prospects RENAME COLUMN telefone_whatsapp TO telefone;
```

> **Nota:** O rename de `telefone_whatsapp` → `telefone` requer atualizar todas as referências no código. Alternativa: manter `telefone_whatsapp` como `telefone` geral e apenas adicionar `whatsapp` + `whatsapp_status`. Vou usar o rename para clareza semântica.

## 2. Arquivos frontend a alterar

### `src/hooks/useImportProspects.ts`
- Atualizar `ParsedProspect` com campos `telefone` e `whatsapp`
- No `COLUMN_MAP`: `'telefone'` → `telefone`, `'whatsapp'`/`'celular'` → `whatsapp`
- Após parse, normalizar número: remover não-dígitos. Se 10 dígitos → salvar em `telefone`. Se 11 dígitos → salvar em `whatsapp` + `whatsapp_status = 'nao_verificado'`
- Ajustar dedup para checar ambos os campos
- Atualizar o insert para enviar `telefone`, `whatsapp`, `whatsapp_status`

### `src/hooks/useOrbitProspects.ts`
- Atualizar filtro de busca: `telefone_whatsapp` → `telefone` e adicionar `whatsapp`

### `src/components/orbit/ProspectDialog.tsx`
- Substituir campo único `telefone_whatsapp` por dois campos: **Telefone** e **WhatsApp**
- Adicionar campo `whatsapp_status` (read-only ou select)
- Atualizar schema zod, defaultValues e reset

### `src/components/orbit/ProspectActionCard.tsx`
- Mostrar telefone e whatsapp separadamente com ícones distintos
- Badge de `whatsapp_status` (✓ válido / ? não verificado / ✗ inválido)
- Botão "Iniciar conversa" (WhatsApp) habilitado apenas quando `whatsapp` existir e `whatsapp_status !== 'invalido'`

### `src/components/orbit/RecipientSelector.tsx`
- `hasContact` para canal whatsapp: checar `p.whatsapp` (não mais `telefone_whatsapp`) e `whatsapp_status !== 'invalido'`
- Atualizar referências de exibição

### `src/pages/orbit/ProspectsPage.tsx`
- `onWhatsApp` usar `prospect.whatsapp` em vez de `telefone_whatsapp`

### `src/pages/orbit/OrbitDashboard.tsx`
- Atualizar mapeamento de `telefone_whatsapp` → `telefone`

### `src/pages/orbit/ConversasPage.tsx`
- Referências de `telefone_whatsapp` na conversa (estes usam `orbit_conversas.telefone_whatsapp` que não muda)

### `src/pages/orbit/ConfigPage.tsx`
- Atualizar referência na tabela de prospects

### `src/components/orbit/ProspectCard.tsx`
- Atualizar referências (se usado)

## 3. Edge Functions a alterar

### `supabase/functions/send-orbit-campaign/index.ts`
- Para canal WhatsApp: usar `prospect.whatsapp` em vez de `prospect.telefone_whatsapp`
- Filtrar apenas prospects com `whatsapp IS NOT NULL` e `whatsapp_status != 'invalido'`

### `supabase/functions/orbit-webhook/index.ts`
- Ao criar prospect via webhook WhatsApp: salvar número em `whatsapp` (e em `telefone` também)
- Buscar prospect por `whatsapp` em vez de `telefone_whatsapp`

### `supabase/functions/orbit-ai-agent/index.ts`
- Atualizar referência de contexto

### `supabase/functions/send-vendedor-notification/index.ts`
- Atualizar template de notificação

## 4. Edge Function nova: `orbit-validate-whatsapp`

Endpoint para validar números via Z-API (individual ou em lote):

```
POST /orbit-validate-whatsapp
{ prospect_ids: string[] }
```

- Busca config Z-API da empresa
- Para cada prospect com `whatsapp` preenchido, chama Z-API `phone-exists`
- Atualiza `whatsapp_status` para `valido` ou `invalido`
- Retorna resumo

Será chamado:
- Automaticamente ao "Iniciar conversa" (validação individual)
- Via botão "Validar WhatsApp" na UI (lote)

## 5. Resumo de arquivos

| Arquivo | Ação |
|---|---|
| Migration SQL | ADD `whatsapp`, `whatsapp_status`; RENAME `telefone_whatsapp` → `telefone`; migrar dados |
| `useImportProspects.ts` | Lógica 10/11 dígitos, novos campos |
| `useOrbitProspects.ts` | Atualizar filtro de busca |
| `ProspectDialog.tsx` | 2 campos separados + badge status |
| `ProspectActionCard.tsx` | Exibir telefone/whatsapp separados, badge status, condicional no botão |
| `RecipientSelector.tsx` | Usar `whatsapp` para canal WhatsApp |
| `ProspectsPage.tsx` | Usar `whatsapp` no onWhatsApp |
| `OrbitDashboard.tsx` | Atualizar ref |
| `ConfigPage.tsx` | Atualizar ref |
| `ProspectCard.tsx` | Atualizar ref |
| `send-orbit-campaign` | Usar `whatsapp` para envio |
| `orbit-webhook` | Salvar em `whatsapp` |
| `orbit-ai-agent` | Atualizar contexto |
| `send-vendedor-notification` | Atualizar template |
| **Nova:** `orbit-validate-whatsapp` | Validação Z-API individual/lote |

