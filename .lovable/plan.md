

# Handoff da IA para Vendedor via WhatsApp

## Resumo

Quando a IA concluir a triagem (cadastro completo ou lead pedir humano), o sistema gera um resumo, envia WhatsApp para o vendedor responsável com link direto para o lead, e registra tudo em uma tabela de controle.

## Banco de Dados

### Nova tabela `orbit_handoffs`

```sql
CREATE TABLE orbit_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES orbit_empresas(id),
  conversa_id uuid REFERENCES orbit_conversas(id) NOT NULL,
  prospect_id uuid REFERENCES orbit_prospects(id),
  vendedor_id uuid REFERENCES profiles(id),
  resumo text,
  status text NOT NULL DEFAULT 'pending', -- pending, sent, failed
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orbit_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa members can view handoffs"
  ON orbit_handoffs FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Unique constraint: 1 handoff per conversa (unless manually reset)
CREATE UNIQUE INDEX idx_handoffs_conversa_unique 
  ON orbit_handoffs (conversa_id) WHERE status IN ('sent', 'pending');
```

### Adicionar campo na `orbit_conversas`

```sql
ALTER TABLE orbit_conversas
  ADD COLUMN IF NOT EXISTS handoff_sent_at timestamptz;
```

## Backend — Edge Function `orbit-ai-agent/index.ts`

Modificar o bloco pós-resposta da IA (linhas ~237-267) para adicionar lógica de handoff:

**Triggers do handoff:**
1. `parsed.cadastro_completo === true` (IA coletou dados mínimos)
2. `parsed.intencao === "falar_humano"` (lead pediu humano)

**Lógica:**
1. Verificar se já existe handoff para esta conversa (`orbit_handoffs` com `status = 'sent'`)
2. Se não existe, identificar vendedor:
   - Usar `responsavel_id` do prospect (recém-atribuído ou pré-existente)
   - Fallback: buscar vendedor padrão da `orbit_distribuicao_config`
3. Buscar dados do vendedor (`profiles` → nome, telefone/whatsapp) e dados do vendedor em `pe_users` (whatsapp)
4. Gerar resumo estruturado com dados do prospect + última mensagem + contexto
5. Montar link wa.me: `https://wa.me/{telefone_lead}?text={mensagem_pre_preenchida}`
6. Enviar WhatsApp para vendedor via Z-API (reutilizar `sendWhatsAppMessage` existente ou chamar direto)
7. Inserir registro em `orbit_handoffs`
8. Atualizar `orbit_conversas.handoff_sent_at`

**Mensagem para o vendedor:**
```
🔔 *Novo Lead Qualificado pela IA*

👤 Nome: {nome}
🏢 Empresa: {empresa}
💬 WhatsApp: {telefone_lead}
📍 Cidade: {cidade}/{estado}

📋 Interesse: {interesse}
📝 Resumo: {resumo_conversa}

💬 Última msg: "{ultima_mensagem}"
🕐 {data_hora}

👉 Entrar em contato:
https://wa.me/{telefone_lead}?text=Olá, aqui é {nome_vendedor}...
```

**Atualizar o system prompt** para incluir `"falar_humano"` como valor possível de `intencao`.

## Frontend — `ConversasPage.tsx`

Na área do header da conversa ativa, quando `active.handoff_sent_at` existir, exibir badge:

```tsx
{active.handoff_sent_at && (
  <Badge variant="secondary">
    ✅ Vendedor notificado • {format(...)}
  </Badge>
)}
```

### Novo hook `useOrbitHandoffs.ts`

Query simples para buscar handoff de uma conversa e exibir detalhes (vendedor notificado, resumo, quando).

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| Nova migration SQL | Criar `orbit_handoffs` + coluna `handoff_sent_at` |
| `supabase/functions/orbit-ai-agent/index.ts` | Adicionar lógica de handoff pós-triagem |
| `src/pages/orbit/ConversasPage.tsx` | Badge "vendedor notificado" |
| `src/hooks/useOrbitHandoffs.ts` | Novo hook para consultar handoffs |
| `src/hooks/useOrbitConversas.ts` | Incluir `handoff_sent_at` na query (já vem com `*`) |

