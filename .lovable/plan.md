

# Contexto de origem para conversas de campanha

## Problema
Quando um prospect responde a uma mensagem de campanha, a IA trata como primeira interação — envia boas-vindas e não tem contexto da mensagem outbound que originou a conversa.

## Solução
Usar o campo JSON `ai_contexto` já existente na tabela `orbit_conversas` para armazenar metadados de origem. Não precisa de migração.

## Alterações

### 1. `send-orbit-campaign/index.ts` — Ao criar/atualizar conversa de campanha

Ao inserir nova conversa (linha ~457) e ao registrar a mensagem, salvar no `ai_contexto`:

```typescript
// Na criação da conversa:
ai_contexto: {
  origin: "outbound_campaign",
  campaign_id: campaign.id,
  intro_already_sent: true,
  estado: "aguardando_resposta",
}
```

Ao usar conversa existente, fazer merge no `ai_contexto` existente:
```typescript
// Update ai_contexto com info da campanha
await supabase.from("orbit_conversas").update({
  ai_contexto: {
    ...existingConversa.ai_contexto,
    origin: "outbound_campaign",
    campaign_id: campaign.id,
    intro_already_sent: true,
    estado: "aguardando_resposta",
  }
}).eq("id", conversaId);
```

### 2. `orbit-ai-agent/index.ts` — Usar contexto de origem

Na construção do prompt (linha ~143), ler do `ai_contexto`:

```typescript
const isFromCampaign = aiContexto.origin === "outbound_campaign";
const introAlreadySent = aiContexto.intro_already_sent === true;
```

Ajustar a flag `primeiraInteracao`:
```typescript
const primeiraInteracao = !introAlreadySent && (mensagensOUT === 0 || mensagensIN <= 1);
```

Adicionar ao system prompt regra condicional:
```
REGRA DE CAMPANHA: Esta conversa foi iniciada por uma campanha outbound. 
O prospect já recebeu uma mensagem nossa. NÃO envie boas-vindas novamente.
Considere o histórico abaixo e responda de forma contextualizada à última 
mensagem que enviamos.
```

O histórico já é carregado (últimas 20 msgs), então a IA verá a mensagem OUT da campanha automaticamente (item 4 do pedido).

### 3. Buscar `ai_contexto` na conversa existente (send-orbit-campaign)

Ao buscar conversa existente (linha ~444), incluir `ai_contexto` no select para fazer merge:
```typescript
const { data: existingConversa } = await supabase
  .from("orbit_conversas")
  .select("id, ai_contexto")
  ...
```

## Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | Salvar `origin`, `intro_already_sent`, `estado` no `ai_contexto` da conversa |
| `supabase/functions/orbit-ai-agent/index.ts` | Ler contexto de campanha, pular boas-vindas, usar histórico outbound |

Sem migração necessária — tudo via campo JSON `ai_contexto` existente.

