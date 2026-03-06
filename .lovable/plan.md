

# Substituir "Solicitar Aprovação" por fluxo "Revisar e Aprovar para Envio"

## Resumo

Remover o conceito de aprovação por terceiros e implementar um fluxo operacional: **Rascunho → Revisar → Aprovar para Envio → Enviar**.

## Mudanças

### 1. `src/pages/orbit/CampanhasPage.tsx`

**Status config** - Atualizar o mapa de status:
- Remover `pendente_aprovacao`, `aprovada`, `reprovada`
- Adicionar `em_revisao` ("Em Revisão"), `aprovada_para_envio` ("Aprovada para Envio")

**Remover handlers desnecessários**: `handleRequestApproval`, `handleApprove`, `handleReject` e a chamada à edge function `request-campaign-approval`.

**Novo state**: `reviewCampaignId` para controlar qual campanha está no modal de revisão.

**Novo handler `handleApproveForSend`**: Atualiza a campanha com `status: "aprovada_para_envio"` e insere um registro em `orbit_campaign_approvals` com `acao: "aprovada_para_envio"`.

**Novo componente `CampaignReviewDialog`**: Modal que exibe:
- Nome, canal, template, data de criação
- Texto completo da mensagem e imagem (se houver)
- Contagem de destinatários (total, pendentes, válidos, inválidos)
- Botão "Aprovar para Envio" (principal)
- Botão "Fechar"

Para obter o template completo, buscar dados da campanha com join no template (já disponível via `c.template`). Buscar o template completo (`corpo_texto`, `imagem_url`, `assunto_email`) via query adicional usando `template_id`.

**Atualizar `CampaignActions`**:
- Remover `canRequestApproval`, `canApprove`, props `onRequestApproval`, `onApprove`, `onReject`
- Adicionar `canReview = ["rascunho", "em_revisao"].includes(status) && hasTemplate && totalRecipients > 0`
- Adicionar `canSend = status === "aprovada_para_envio" && pendingRecipients > 0`
- `canResume` = `(status === "enviando" || status === "pausada" || status === "pausada_por_limite") && pendingRecipients > 0`
- Botão "Revisar Campanha" chama `onReview(campaignId)`
- Guidance message para rascunho sem template/recipients atualizada (remover menção a "aprovação")

**Atualizar filtro de status no Select**: substituir valores antigos pelos novos.

### 2. `src/hooks/useOrbitCampaigns.ts`

Atualizar a query para buscar template com campos completos:
```
select("*, template:orbit_message_templates(id, nome, canal, corpo_texto, imagem_url, assunto_email)")
```

### 3. Nenhuma migração de banco necessária

O campo `status` é `text` livre. Os novos valores (`em_revisao`, `aprovada_para_envio`) funcionam sem alteração de schema.

## Fluxo final de status

```
rascunho → em_revisao → aprovada_para_envio → enviando → concluida
                                              → pausada / pausada_por_limite
                                              → cancelada
```

## Regras de botões

| Botão | Condição |
|---|---|
| Revisar Campanha | status in (rascunho, em_revisao) AND template AND recipients > 0 |
| Aprovar para Envio | Dentro do modal de revisão |
| Enviar Campanha | status = aprovada_para_envio AND pendentes > 0 |
| Retomar Envio | status in (enviando, pausada, pausada_por_limite) AND pendentes > 0 |
| Pausar | status = enviando |
| Cancelar | status not in (concluida, cancelada) |
| Excluir | status = rascunho |

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `src/pages/orbit/CampanhasPage.tsx` | Reescrever ações, adicionar modal de revisão, remover aprovação por terceiros |
| `src/hooks/useOrbitCampaigns.ts` | Incluir campos completos do template na query |

