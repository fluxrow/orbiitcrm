

# Mensagens da IA não aparecem na tela de Conversas

## Causa raiz

As mensagens OUT (respostas da IA) estão sendo inseridas pelo `orbit-ai-agent` **sem o campo `empresa_id`**. A RLS da tabela `orbit_mensagens` exige `empresa_id = get_user_empresa_id(auth.uid())` para SELECT, então mensagens com `empresa_id = NULL` ficam invisíveis para o usuário.

Confirmado pela query: todas as mensagens IN têm `empresa_id = c4ea82e5...`, mas todas as OUT têm `empresa_id = NULL`.

O `orbit-send-message` já foi corrigido (linha 125: `empresa_id: profile?.empresa_id`), mas o `orbit-ai-agent` nunca foi — todos os 3 inserts na função `sendWhatsAppMessage` não incluem `empresa_id`.

## Correções

### 1. `orbit-ai-agent` — adicionar `empresa_id` nos 3 inserts de mensagem

Na função `sendWhatsAppMessage`, o parâmetro `empresaId` já é recebido mas não é usado nos inserts. Adicionar `empresa_id: empresaId` nos 3 locais:
- Linha 280 (demo mode insert)
- Linha 326 (production mode insert)  
- Linha 345 (fallback insert sem Z-API)

### 2. Migração SQL — corrigir mensagens existentes com `empresa_id = NULL`

```sql
UPDATE orbit_mensagens m
SET empresa_id = c.empresa_id
FROM orbit_conversas c
WHERE m.conversa_id = c.id
  AND m.empresa_id IS NULL
  AND c.empresa_id IS NOT NULL;
```

Isso corrige todas as mensagens já existentes para que apareçam imediatamente.

