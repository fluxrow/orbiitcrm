

# Fix: Mensagens de campanha não aparecem em Conversas

## Problema

A edge function `send-orbit-campaign` envia mensagens via Z-API diretamente, mas **não cria registros em `orbit_conversas` nem em `orbit_mensagens`**. Por isso as mensagens enviadas por campanha não aparecem no módulo Conversas.

Em contraste, o `orbit-send-message` (envio manual) sempre salva em `orbit_mensagens` e atualiza `orbit_conversas`.

## Solução

Após cada envio bem-sucedido de WhatsApp/email na campanha, o sistema deve:

1. **Buscar ou criar uma conversa** (`orbit_conversas`) para o prospect
2. **Inserir a mensagem** em `orbit_mensagens` com `direcao: "OUT"` e referência à campanha
3. **Atualizar a conversa** com `ultima_mensagem_at` e `ultima_mensagem_preview`

## Alteração — `supabase/functions/send-orbit-campaign/index.ts`

Após o envio bem-sucedido (linha ~435, antes do update do recipient para "enviado"), adicionar:

```typescript
// ── Registrar em Conversas ──
// 1. Buscar conversa aberta existente para este prospect
let conversaId: string | null = null;
const { data: existingConversa } = await supabase
  .from("orbit_conversas")
  .select("id")
  .eq("prospect_id", prospect.id)
  .eq("empresa_id", campaign.empresa_id)
  .eq("status", "aberta")
  .maybeSingle();

if (existingConversa) {
  conversaId = existingConversa.id;
} else {
  // Criar nova conversa
  const { data: novaConversa } = await supabase
    .from("orbit_conversas")
    .insert({
      empresa_id: campaign.empresa_id,
      prospect_id: prospect.id,
      canal: campaign.canal,
      telefone_whatsapp: validatedPhone,
      status: "aberta",
      ultima_mensagem_at: new Date().toISOString(),
      ultima_mensagem_preview: mensagem.substring(0, 100),
    })
    .select("id")
    .single();
  conversaId = novaConversa?.id || null;
}

if (conversaId) {
  // 2. Inserir mensagem
  await supabase.from("orbit_mensagens").insert({
    conversa_id: conversaId,
    empresa_id: campaign.empresa_id,
    direcao: "OUT",
    mensagem,
    canal: campaign.canal,
    status: isDemo ? "simulated" : "enviada",
    campaign_id: campaign.id,
  });

  // 3. Atualizar conversa
  await supabase.from("orbit_conversas").update({
    ultima_mensagem_at: new Date().toISOString(),
    ultima_mensagem_preview: mensagem.substring(0, 100),
  }).eq("id", conversaId);
}
```

A mesma lógica se aplica ao canal email, adaptando os campos.

Para mensagens simuladas (demo), também registrar com `status: "simulated"`.

## Verificação de schema

Verificar se `orbit_mensagens` possui coluna `campaign_id`. Se não existir, criar via migration:

```sql
ALTER TABLE orbit_mensagens ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES orbit_campaigns(id);
```

Isso permite filtrar/identificar mensagens originadas de campanhas.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | Adicionar criação de conversa + mensagem após envio |
| Nova migration SQL | Adicionar `campaign_id` em `orbit_mensagens` (se necessário) |

