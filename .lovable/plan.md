

## Diagnóstico — Campanha marcou 3 números como "WhatsApp inválido"

### O que aconteceu

Na campanha "Campanha teste 04-2026" (`2b90b56e-...`) os 3 destinatários foram marcados como `whatsapp_status = invalido` no exato momento do disparo (13:24:54), com erro `IGNORED_NO_WHATSAPP`. **Nenhuma mensagem foi enviada e nenhuma falha real ocorreu** — todos foram pulados pela validação Z-API.

| Prospect | Telefone | whatsapp salvo | Resultado |
|---|---|---|---|
| Flavia Furlan | 5541988018938 | 5541988018938 | invalido |
| Promotrip Corporate | (vazio) | 5541987276129 | invalido |
| Promoclick (Vagner) | 554196204249 | 554196204249 | invalido |

### Causa raiz

`send-orbit-campaign/index.ts` (linhas 477–508) faz:
1. GET `https://api.z-api.io/instances/{id}/token/{token}/phone-exists/{phone}`
2. Lê `result.exists === true`. Se for falso → marca prospect como `invalido` por **7 dias** (cache em `whatsapp_last_check_at`) e pula o envio.

Os logs da edge function não trazem o detalhe da resposta da Z-API (não há `console.log` no fluxo de validação), mas há **dois sinais fortes** de que é um **falso negativo**:

1. **Histórico**: dia 17/03/2026 → 229 inválidos vs 58 válidos (~80% inválidos). Padrão idêntico ao de hoje (3 de 3).
2. **Número da Flávia (5541988018938)** é o mesmo padrão (DDD 41 + 9 + 8 dígitos) que o WhatsApp aceita normalmente — não há motivo plausível para ser inválido de fato.

Hipóteses prováveis para o `exists:false` da Z-API:
- **Instância desconectada/expirada** → algumas versões da Z-API retornam `{exists:false}` (em vez de erro HTTP) quando a instância não está ativa. A `orbit_zapi_config` foi atualizada pela última vez em 03/03/2026 e está marcada como `ativo=true` no banco, mas isso reflete o flag local — não o status real da sessão WhatsApp.
- **Client-Token incorreto/expirado** → idem: alguns endpoints respondem `exists:false` com 200 OK quando o `Client-Token` não bate.
- **Rate limit / endpoint instável** → resposta 200 com `exists:false` em vez de erro.
- **Falta verificação de `connected`** antes de validar.

O código atual confia cegamente em `result.exists === true` e ignora qualquer outro campo (ex: `error`, `connected`, `value`).

### Plano de correção

**1. Endurecer `validateWhatsAppNumber` em `send-orbit-campaign/index.ts`**
- Logar status HTTP, body bruto e `phone` consultado (sem expor token).
- Tratar como **inconclusivo** (não marcar invalido) quando:
  - HTTP != 200
  - Body contém `error` / `connected: false`
  - Resposta não tem o campo `exists` (ou tem mas é null/undefined)
- Em caso inconclusivo: **não atualizar `whatsapp_status`**, marcar recipient como `falhou` com erro `ZAPI_INCONCLUSIVE` (ou pular sem cachear) e seguir.

**2. Pré-checagem da instância antes do loop**
- Antes do `for (const recipient of recipients)`, fazer 1 chamada a `${zapiBaseUrl}/status` (endpoint que retorna `{connected, smartphoneConnected}`).
- Se não conectado → abortar a campanha com erro claro `ZAPI_DISCONNECTED` e **não marcar nenhum prospect como inválido**.

**3. Aplicar mesmas guardas em `orbit-validate-whatsapp` e `orbit-migrate-phones`**
- Mesma checagem `status` antes de iterar; mesma lógica "inconclusivo ≠ inválido".

**4. Reverter os 3 falsos negativos de hoje**
Migration SQL para resetar os prospects marcados hoje (13:24:54) para `nao_verificado`, permitindo nova tentativa após o fix:
```sql
UPDATE orbit_prospects
SET whatsapp_status = 'nao_verificado', whatsapp_last_check_at = NULL
WHERE id IN ('59cc4839-...','7f2de85f-...','953dd178-...');
```
Opcional: fazer o mesmo para os 229 marcados em 17/03 (provavelmente também falsos negativos do mesmo problema).

**5. UI — botão "Revalidar números" na página de prospects**
Já existe `orbit-validate-whatsapp` — só garantir que o botão está acessível e respeitar a lógica nova.

### Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | Endurecer validação + pré-check `/status` + logs |
| `supabase/functions/orbit-validate-whatsapp/index.ts` | Mesma lógica robusta |
| `supabase/functions/orbit-migrate-phones/index.ts` | Mesma lógica robusta |
| Migration SQL | Resetar `whatsapp_status` dos 3 prospects de hoje |
| (opcional) Migration SQL extra | Resetar os 229 marcados em 17/03 para nova validação |

### Pergunta antes de implementar

Você quer também **resetar os 229 prospects** marcados como inválidos em 17/03 (provável mesmo bug), ou só os 3 de hoje?

