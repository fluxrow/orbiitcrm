

# Fix: Resposta duplicada do agente IA

## Problema
Quando o prospect envia duas mensagens rápidas ("Oi." e "Cuido."), o webhook recebe dois eventos separados. Ambos verificam `ai_processing` via SELECT — como as duas chegam quase ao mesmo tempo, ambas veem `ai_processing = false` e disparam duas chamadas ao `orbit-ai-agent`. Resultado: duas respostas enviadas.

## Causa raiz
Race condition no webhook (linhas 401-405): o check de `ai_processing` é feito com SELECT, não é atômico. Duas requisições simultâneas passam pelo check antes que o agente tenha tempo de setar o lock.

## Solução
Usar um **lock atômico** no webhook: em vez de SELECT + check, fazer um UPDATE com condição WHERE que só retorna sucesso se o lock foi adquirido. Se nenhuma row foi atualizada, significa que outro processo já tem o lock.

### Alteração em `supabase/functions/orbit-webhook/index.ts`

Substituir o bloco de check (linhas 399-431) por:

```typescript
// 6. If AI active and human_talk = false and incoming message, call AI agent
if (!fromMe && !conversa.human_talk) {
  // Atomic lock: só dispara AI se conseguir adquirir o lock
  const { data: lockResult } = await supabase
    .from("orbit_conversas")
    .update({ ai_processing: true })
    .eq("id", conversa.id)
    .eq("ai_processing", false)  // ← só atualiza se ainda não está processando
    .select("id");

  if (lockResult && lockResult.length > 0) {
    // Lock adquirido — disparar agente
    let aiConfigQuery = supabase.from("orbit_ai_config").select("*");
    if (empresaId) aiConfigQuery = aiConfigQuery.eq("empresa_id", empresaId);
    const { data: aiConfig } = await aiConfigQuery.maybeSingle();

    if (aiConfig?.modo_automatico) {
      fetch(...); // chamada existente ao orbit-ai-agent
    } else {
      // Liberar lock se não vai chamar IA
      await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", conversa.id);
    }
  } else {
    console.log("[orbit-webhook] AI já processando conversa, msg será agregada:", conversa.id);
  }
}
```

### Por que funciona
O `UPDATE ... WHERE ai_processing = false` é atômico no PostgreSQL. Se duas requisições tentam ao mesmo tempo, apenas uma consegue atualizar a row. A outra recebe 0 rows afetadas e sabe que deve pular.

## Arquivo modificado
- `supabase/functions/orbit-webhook/index.ts` — ~15 linhas alteradas no bloco de lock (linhas 399-431)

