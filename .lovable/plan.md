

# Adicionar campo "Contato" ao Prospect e ajustar lógica de {{nome}}

## Resumo
Adicionar coluna `nome_contato` na tabela `orbit_prospects` para separar o nome da pessoa de contato do nome da empresa. Ajustar a lógica de `{{nome}}` para seguir a cadeia: contato → empresa (nome_razao se não for telefone) → nome_fantasia → vazio.

## Alterações

### 1. Migration: nova coluna `nome_contato`
```sql
ALTER TABLE orbit_prospects ADD COLUMN nome_contato text;
```

### 2. ProspectDialog — adicionar campo "Contato"
Adicionar campo `nome_contato` no formulário (schema zod + campo de input) logo após o campo "Nome / Razão Social", com label "Contato (pessoa)".

### 3. Lógica de `{{nome}}` no envio de campanha
**`supabase/functions/send-orbit-campaign/index.ts`** — Refatorar `getDisplayName`:

```typescript
function getDisplayName(p: any): string {
  // 1. Se tem contato, usar contato
  if (p.nome_contato?.trim()) return p.nome_contato.trim();
  
  // 2. Se nome_razao não é telefone, usar como empresa
  const nome = p.nome_razao || "";
  const digits = nome.replace(/\D/g, "");
  const isPhone = /^\d{8,}$/.test(digits) && digits.length >= 8;
  const isPlaceholder = nome.startsWith("WhatsApp ");
  
  if (!isPhone && !isPlaceholder && nome.trim()) return nome.trim();
  
  // 3. Fallback para nome_fantasia
  if (p.nome_fantasia?.trim()) return p.nome_fantasia.trim();
  
  // 4. Vazio — mensagem sem tag
  return "";
}
```

A variável `{{nome}}` usará esse valor. Se vazio, a tag será substituída por string vazia (mensagem enviada sem nome).

### 4. Mesma lógica nos displays de Conversas
**`src/pages/orbit/ConversasPage.tsx`** — Incluir `nome_contato` na cadeia de fallback para exibição do nome na lista de conversas.

### 5. Ajustar agente IA
**`supabase/functions/orbit-ai-agent/index.ts`** — Incluir `nome_contato` no LeadContext e nos campos que o agente pode extrair/atualizar.

## Arquivos modificados
- Migration SQL (nova coluna)
- `src/components/orbit/ProspectDialog.tsx` — campo de formulário
- `supabase/functions/send-orbit-campaign/index.ts` — lógica de {{nome}}
- `src/pages/orbit/ConversasPage.tsx` — fallback de exibição
- `supabase/functions/orbit-ai-agent/index.ts` — contexto do agente

