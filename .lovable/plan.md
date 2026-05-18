## Diagnóstico

A campanha **"Inicial Clientes PR"** (id `966bdd93…`) foi criada com `total_destinatarios = 2324`, mas a tabela `orbit_campaign_recipients` está **com 0 linhas para essa campanha**. Por isso o dialog mostra:

- Total: 2324 (vem de `campaigns.total_destinatarios`)
- Pendentes: 0 (vem da contagem real em `orbit_campaign_recipients`)
- Já enviados / Inválidos: 2324 (calculado como `total - pendentes`)

E o botão "Aprovar para Envio" fica desabilitado porque `pendingRecipients === 0`.

Confirmei no banco que existem **2350 prospects elegíveis** (com `email_principal`, sem `optout_email`) com a tag `lista:contatos-parana-2026-…`. Ou seja, os destinatários existem — a inserção que deveria ter rodado no `handleCreate` do wizard falhou silenciosamente.

### Causa raiz

Em `src/components/orbit/CampaignWizardContent.tsx` (linha 313):

```ts
if (recipients.length > 0) await supabase.from("orbit_campaign_recipients").insert(recipients);
```

- Insert único de ~2300 linhas pelo navegador → estoura limite de payload / timeout / RLS, e o erro **não é checado** (sem `.throwOnError()` nem verificação de `error`). O toast diz "Campanha criada com sucesso" mesmo quando o insert falha.
- Mesmo quando funciona, é lento e arriscado para listas grandes.

## Plano de correção

### 1. RPC server-side para popular destinatários

Criar `pe_populate_campaign_recipients(p_campaign_id uuid)` que:
- Lê a campanha (valida `empresa_id`, canal, `filtros_json`).
- Calcula os prospects elegíveis em uma única query, aplicando os mesmos filtros do wizard server-side:
  - `empresa_id` da campanha,
  - filtros de `filtros_json` (tags, segmento, estado, status_qualificacao, origem_contato, origem_lead, score_min, responsavel_id, cidade, apenas_consentimento, etc.),
  - canal email → `email_principal IS NOT NULL AND optout_email IS NOT TRUE`,
  - canal whatsapp → `(whatsapp OR telefone) IS NOT NULL AND optout_whatsapp IS NOT TRUE`.
- Faz `INSERT ... ON CONFLICT (campaign_id, prospect_id) DO NOTHING` em `orbit_campaign_recipients` com `status='pendente'`.
- Atualiza `orbit_campaigns.total_destinatarios` = count real.
- Retorna `{ inserted, already_present, total }`.

Garantir índice/uniqueness `(campaign_id, prospect_id)` (provavelmente já existe — verificar antes de criar).

### 2. Usar a RPC na criação (wizard)

Em `handleCreate`:
- Após criar a campanha, chamar `supabase.rpc("pe_populate_campaign_recipients", { p_campaign_id })` em vez do `insert` do navegador.
- Tratar erro corretamente (toast vermelho + abortar fluxo).

### 3. Botão "Repopular destinatários" no dialog de revisão

Em `src/components/orbit/CampaignReviewDialog.tsx`, quando `pendingRecipients === 0 && totalRecipients > 0` (ou sempre, como ação secundária para o status `em_revisao`/`rascunho`):
- Mostrar botão "Recarregar destinatários".
- Chama a mesma RPC; após sucesso invalida `campaign_recipient_counts` e mostra toast com `inserted`.
- Isso resolve **a campanha atual** sem precisar recriar.

### 4. Backfill imediato da campanha já criada

Após a RPC estar pronta, executar uma vez no banco:
```sql
SELECT pe_populate_campaign_recipients('966bdd93-2dee-4e74-bbe0-c409ddaea304');
```
para destravar o envio da "Inicial Clientes PR" sem clique adicional do usuário.

## Arquivos afetados

- **Nova migration SQL**: função `pe_populate_campaign_recipients` + (se faltar) índice único `(campaign_id, prospect_id)`.
- `src/components/orbit/CampaignWizardContent.tsx` — substituir insert manual pela RPC, com checagem de erro.
- `src/components/orbit/CampaignReviewDialog.tsx` — adicionar botão "Recarregar destinatários" + hook para chamar a RPC.
- `src/pages/orbit/CampanhasPage.tsx` — invalidar `campaign_recipient_counts` após recarregar.

## Resultado esperado

- "Inicial Clientes PR" passa a mostrar ~2350 pendentes e o botão "Aprovar para Envio" libera.
- Próximas campanhas grandes (>1k destinatários) são criadas de forma confiável em <2s, sem inserts perdidos.
- Qualquer campanha futura que entre nesse estado (0 pendentes / total > 0) é recuperável com 1 clique.
