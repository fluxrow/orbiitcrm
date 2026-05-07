## Objetivo

1. **Segmentação por engajamento de email**: criar campanhas mirando contatos que **abriram**, **clicaram**, **abriram + clicaram** (engajados), ou **não abriram** — agregando dados de **todas as campanhas** (não só uma).
2. **Botão WhatsApp** configurável no template/campanha de email para o lead clicar e cair direto na conversa com o consultor.

---

## Parte 1 — Filtros de Engajamento

### O que já existe

- `orbit_campaign_recipients` já tem `opened_at`, `clicked_at`, `bounced_at`, `complained_at`, `engagement_status`.
- `orbit_email_events` registra cada `opened`/`clicked` com timestamp, IP, user-agent.
- `RecipientSelector` já tem 3 filtros **por campanha específica**: `excluir_campanha_id`, `apenas_abriu_campanha_id`, `nao_abriu_campanha_id`.

### Limitações atuais

- Só filtra por **uma** campanha por vez. Não há "abriu qualquer email nos últimos 30 dias", "clicou em qualquer link", "engajou + interessado".
- Não usa dados do Resend (bounces/complaints já são salvos via `orbit-resend-webhook`, mas não filtráveis na UI de campanha).

### Mudanças propostas

**A) Nova função SQL `get_prospect_engagement_summary(empresa_id, dias)**`
Retorna por `prospect_id` um resumo agregado de TODAS as campanhas dentro do período:

- `total_emails_recebidos`, `total_aberturas`, `total_cliques`
- `ultima_abertura_em`, `ultimo_clique_em`
- `engajamento_score` (0-100, baseado em aberturas + cliques recentes)
- `bounced` (bool), `complained` (bool)

Usa `orbit_campaign_recipients` filtrado por `empresa_id` e `enviado_em >= now() - interval`.

**B) Novo bloco "Engajamento de Email" em `RecipientSelector.tsx**`
Visível só quando `canal === "email"`. Adicionar ao `CampaignFilters`:

```ts
engajamento_email?: {
  comportamento: "abriu" | "clicou" | "engajou" | "nao_abriu" | "nunca_recebeu" | "bounced";
  janela_dias: 7 | 30 | 90 | 180 | "todos";
  min_aberturas?: number;   // ex: ≥ 2 aberturas
  min_cliques?: number;
}
```

UI:

- **Comportamento** (Select): "Abriu pelo menos um email" / "Clicou em algum link" / "Engajado (abriu + clicou)" / "Não abriu nenhum" / "Bounced ou reclamou (excluir)" / "Nunca recebeu campanha"
- **Janela** (Select): últimos 7/30/90/180 dias / desde sempre
- **Mínimo de aberturas** e **mínimo de cliques** (opcionais, sliders)

Ao aplicar, faz query da função SQL e cruza com `filteredProspects`.

**C) Indicadores visuais na lista de prospects**
Ao lado do nome, badges discretos: 🔥 "Engajado", 👁️ "Abriu 3x", ⚠️ "Bounced". Reaproveita o `engagement_summary` já carregado.

**D) Filtro de exclusão de bounced/complained automático**
Toggle "Excluir contatos com bounce ou reclamação" (default **ligado**) — protege reputação do domínio.

### Sobre a API do Resend

Os dados que o Resend nos dá (delivered, bounced, complained, opened, clicked) **já chegam** via `orbit-resend-webhook` e são salvos em `orbit_campaign_recipients`. Não precisamos chamar a API do Resend para listar — a fonte de verdade é nosso banco. Webhook precisa estar configurado no painel Resend (verificar).

---

## Parte 2 — Botão WhatsApp embed em emails

### Onde configurar

**Nível 1 — Template (`orbit_message_templates`)**
Adicionar colunas:

- `whatsapp_cta_enabled` boolean default false
- `whatsapp_cta_numero` text (E.164, ex: `5541999999999`)
- `whatsapp_cta_texto_botao` text default "Falar no WhatsApp"
- `whatsapp_cta_mensagem_inicial` text (mensagem pré-preenchida no chat, ex: "Olá! Vi seu email sobre {{produto}}")
- `whatsapp_cta_posicao` text check ('topo','rodape','ambos') default 'rodape'

**Nível 2 — Override por campanha (`orbit_campaigns`)**
Mesmas colunas opcionais (se preenchidas, sobrescrevem o template). Útil para A/B testing de número/texto.

### UI

`**EmailTemplateEditor.tsx**`: novo card "Botão WhatsApp" com:

- Switch ativar
- Input número (validação E.164, máscara BR)
- Input texto do botão
- Textarea mensagem inicial (com chips de variáveis: `{{nome}}`, `{{empresa}}`)
- Select posição (topo / rodapé / ambos)
- Preview ao vivo do botão renderizado

**Wizard de campanha (`CampaignWizardContent`)**: aba/seção "Personalizar CTA WhatsApp" — mostra config herdada do template com toggle "Sobrescrever para esta campanha".

### Renderização no email enviado

Em `orbit-send-email/index.ts`, ao montar o HTML final:

1. Resolver config (campanha override → template).
2. Substituir variáveis na `mensagem_inicial`.
3. Construir URL: `https://wa.me/{numero}?text={encodeURIComponent(mensagem)}`.
4. Injetar HTML do botão (table-based, inline-styled, compatível com Outlook/Gmail) no topo, rodapé ou ambos.

Modelo do botão (table HTML para compatibilidade):

```html
<table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto;">
  <tr><td align="center" bgcolor="#25D366" style="border-radius:28px;">
    <a href="https://wa.me/55..." style="display:inline-block;padding:14px 28px;
       font:600 16px/1 Arial,sans-serif;color:#fff;text-decoration:none;border-radius:28px;">
      📱 Falar no WhatsApp
    </a>
  </td></tr>
</table>
```

5. **Tracking de cliques**: envolver a URL `wa.me` com o redirect já existente `orbit-email-track?type=click&rid={recipient_id}&url=...` para contar cliques no WhatsApp como engajamento (e marcar `clicked_at`).

### Bonus — atribuição de origem

No webhook Z-API (`orbit-webhook`), quando chegar mensagem nova de um número que está em `orbit_campaign_recipients` com `clicked_at` recente, registrar evento "respondeu_via_email_cta" no timeline do prospect.

---

## Arquivos afetados


| Arquivo                                                               | Mudança                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Migration SQL                                                         | Função `get_prospect_engagement_summary`; colunas `whatsapp_cta_*` em `orbit_message_templates` e `orbit_campaigns` |
| `src/components/orbit/RecipientSelector.tsx`                          | Bloco "Engajamento de Email" + badges visuais + toggle exclusão bounced                                             |
| `src/hooks/useOrbitProspects.ts` (ou novo `useProspectEngagement.ts`) | Hook que carrega o resumo de engajamento                                                                            |
| `src/components/orbit/EmailTemplateEditor.tsx`                        | Card de configuração do botão WhatsApp + preview                                                                    |
| `src/components/orbit/CampaignWizardContent.tsx`                      | Seção override do CTA por campanha                                                                                  |
| `supabase/functions/orbit-send-email/index.ts`                        | Resolver config, montar HTML do botão, envolver no tracker                                                          |
| `supabase/functions/orbit-webhook/index.ts` (opcional)                | Marcar atribuição "veio do email CTA"                                                                               |


---

## Perguntas antes de implementar

1. **Botão WhatsApp — número padrão**: usar o número da config Z-API da empresa como default, ou sempre exigir input manual no template?  usar padrao
2. **Atribuição de origem** (bonus): implementar agora ou deixar para depois? agora, com segurançq
3. **Janela default** do filtro de engajamento: últimos **30** ou **90** dias? de 30 a 90 podendo escolher o periodo. 