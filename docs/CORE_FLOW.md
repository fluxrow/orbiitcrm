# Orbit Core Flow

Documento de referência para devs e onboarders. O **Orbit Core Flow** é o template mestre — a espinha dorsal de qualquer conta nova do Orbit CRM. Ele atende ~90% dos mentores/consultores. O que muda entre nichos é apenas:

1. Os **templates de mensagem** `[CORE] *` (editados inline dentro do fluxo).
2. O **prompt de identidade da IA** (aba "Cérebro da IA").
3. Links de agendamento/pagamento.

Nunca customize a estrutura do fluxo — customize as bordas.

---

## Estrutura oficial

```text
Trigger: orbit_lead_recebido
│
├─ 1. SWITCH prospect.origem
│    ├─ instagram|meta|facebook|ads → tag ORIGEM_ADS
│    ├─ site|typebot|landing|form   → tag ORIGEM_SITE
│    └─ default                     → tag ORIGEM_MANUAL
│
├─ 2. AI Agent → prompt "CORE_QUALIFICACAO_INICIAL"
│
├─ 3. IF prospect.qualificado == true
│    ├─ THEN: create_task + notify_vendedor (admin)
│    └─ ELSE:
│         └─ IF prospect.renda_baixa == true
│              ├─ THEN: send_template [CORE] OFFER_LOW_TICKET
│              └─ ELSE: send_template [CORE] NURTURING_GENERICO
│
├─ 4. delay 3h
│
├─ 5. AI Agent → prompt "CORE_FOLLOWUP"
│
├─ 6. SWITCH conversa.status
│    ├─ aberta    → delay 24h (re-check)
│    └─ encerrada → end
│
└─ 7. IF conversa.status == handoff
      └─ notify_vendedor(responsavel) + create_task urgente
```

---

## Templates `[CORE]` esperados

Estes slugs são referenciados pelo Core Flow. Ao instanciar em uma conta nova, o onboarder deve criar (ou copiar) estes templates de mensagem na aba **WhatsApp → Templates**:

| Slug                              | Uso                                     | Placeholders essenciais                                   |
| --------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| `[CORE] Abordagem Inicial`        | Primeira mensagem após lead novo        | `{{prospect.nome}}`, `{{empresa.nome}}`                   |
| `[CORE] Quebra de Objeção`        | Resposta a objeções comuns              | `{{prospect.nome}}`, `{{link_agendamento}}`               |
| `[CORE] OFFER_LOW_TICKET`         | Downsell para lead desqualificado       | `{{prospect.nome}}`, `{{link_pagamento}}`                 |
| `[CORE] NURTURING_GENERICO`       | Conteúdo para aumentar consciência      | `{{prospect.nome}}`                                       |
| `[CORE] Novo Deal Qualificado`    | Notificação interna para o admin        | `{{prospect.nome}}`, `{{prospect.telefone}}`              |
| `[CORE] Handoff Ouro`             | Notificação de handoff para o vendedor  | `{{prospect.nome}}`, `{{vendedor.nome}}`                  |

Prompts IA esperados (aba **Cérebro da IA**):
- `CORE_QUALIFICACAO_INICIAL` — classifica `qualificado` (bool) e `renda_baixa` (bool).
- `CORE_FOLLOWUP` — lê histórico e propõe próximo passo (mensagem, delay, encerrar).

---

## Como instanciar em uma nova conta

**Fluxo manual (5 min):**

1. Vá em **Configurações → Fluxos → Novo Fluxo**.
2. Selecione o template **`[CORE] Orbit Core Flow`** (badge "Oficial").
3. Ajuste os `template_slug` das ações `send_whatsapp_template` e `notify_vendedor` para os templates `[CORE]` da conta (o `TemplateSelectField` mostra a lista).
4. Configure o prompt da IA na aba **Cérebro da IA** com os slugs `CORE_QUALIFICACAO_INICIAL` e `CORE_FOLLOWUP`.
5. Ative o fluxo.

**Fluxo por JSON (dev):**

Use o botão **Exportar** no Gerenciador de Templates para baixar o `.flow.json` de referência. Importe em outro tenant com o botão **Importar**.

---

## Como editar o Core Flow globalmente

O template está seedado via migration (`is_official = true`, `nome = '[CORE] Orbit Core Flow'`). Para publicar uma melhoria para todos:

1. Crie uma nova migration com `INSERT ... ON CONFLICT (nome) DO UPDATE` alterando `definicao`.
2. Aplique.
3. Contas **já criadas** não são atualizadas automaticamente — o template é apenas o "molde". Para propagar, use o botão futuro **"Aplicar em contas ativas"** ou peça ao cliente para recriar o fluxo a partir do template.

---

## Contrato de campos usados nas condições

O fluxo assume que o pipeline populou os seguintes campos:

| Campo                     | Origem                                             |
| ------------------------- | -------------------------------------------------- |
| `prospect.origem`         | Setado pelo ingestor (webhook, form, manual)       |
| `prospect.qualificado`    | Setado pela ação `toggle_ai_agent` (IA classifica) |
| `prospect.renda_baixa`    | Setado pela IA na qualificação inicial             |
| `conversa.status`         | `aberta` / `encerrada` / `handoff` (Z-API sync)    |

Se algum destes não existir na conta, a ação correspondente cai no `default` / `else` — o fluxo nunca quebra.

---

## FAQ

**Posso apagar uma ação do Core Flow?**  
Sim, mas perde universalidade. Prefira duplicar o template e editar a cópia.

**Como voltar ao padrão?**  
Delete o fluxo instanciado e crie um novo a partir do template `[CORE] Orbit Core Flow`.

**Posso ter dois Core Flows na mesma conta?**  
Não é recomendado — só um deve ter trigger `lead_recebido`.
