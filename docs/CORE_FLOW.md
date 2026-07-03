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

---

## Instanciar em um tenant (1 clique)

Em `Configurações → Fluxos`, o botão **Instanciar Core Flow** aparece
quando o template com `is_official = true` e nome iniciando por `[CORE]`
está disponível e o tenant ainda não tem um fluxo vinculado a ele.

Ao clicar, um dialog pede três variáveis do cliente:

| Placeholder             | Onde é substituído                                              |
| ----------------------- | --------------------------------------------------------------- |
| `{{empresa.nome}}`      | Corpo dos templates, prompts da IA, títulos de task            |
| `{{vendedor.telefone}}` | Ação `notify_vendedor` (número default do handoff)              |
| `{{link_agendamento}}`  | Templates de mensagem `[CORE] Quebra de Objeção` etc.           |

A substituição é feita por `injectPlaceholderValues()` em
`src/lib/flowTemplateSchema.ts`: apenas valores **string** dentro de
`trigger_config` / `condicoes` / `action_config` (recursivo em
`then_actions` / `else_actions` / `cases`). Placeholders deixados em
branco preservam o `{{placeholder}}` original para você preencher depois.

O fluxo nasce **inativo** (`ativo = false`) — você revisa e ativa.

---

## Templates Oficiais são imutáveis

Templates com `is_official = true` são a espinha dorsal e não podem ser
alterados livremente:

- **UI:** botões `Editar`, `Duplicar` e `Excluir` ficam desabilitados no
  `FlowTemplatesManager` com tooltip explicativo. Só sobra
  `Configurar variações`, `Exportar` e o switch `Ativo`.
- **Banco:** o trigger `prevent_official_flow_template_edit` bloqueia
  `UPDATE` de `nome`, `descricao`, `categoria`, `definicao` e
  `is_official`, e bloqueia `DELETE`. Apenas `service_role` bypassa
  (para permitir seed inicial e a edge function de variações).
- **Variações permitidas:** o dialog `OfficialTemplateVariationsDialog`
  chama a edge function `orbit-flow-template-variation` (super-admin
  only) que aceita apenas um objeto
  `{ templates: {oldId: newId}, agents: {oldSlug: newSlug} }` e regrava
  a `definicao` trocando as referências nas ações
  `send_whatsapp_template` / `send_email_template` / `send_rich_media`
  e `toggle_ai_agent`.

Para editar tudo, exporte o `.flow.json` e importe como template comum
(sem o prefixo `[CORE]` e sem `is_official`).

---

## Import validado (`.flow.json`)

O import passa por duas camadas antes de gravar:

1. **`parseTemplateImport`** — valida JSON e schema Zod, e recusa
   versões fora de `SUPPORTED_IMPORT_VERSIONS` (hoje `[1]`) com
   mensagem clara.
2. **`ImportPreviewDialog`** — abre uma prévia com três seções:
   - **Placeholders:** cada `{{...}}` é comparado com
     `TEMPLATE_PLACEHOLDER_WHITELIST` (+ `payload.*` e `custom.*`).
     Desconhecidos ficam amarelos (warning, não bloqueiam).
   - **Templates de mensagem:** cada `template_id` referenciado é
     conferido contra `orbit_message_templates` do tenant. Ausentes
     ficam vermelhos e obrigam mapeamento via `Select`.
   - **Agentes de IA:** o mesmo para `agent_slug` contra
     `orbit_ai_config`.

O botão **Importar** só habilita quando não há bloqueios. O mapeamento
é aplicado por `remapFlowDefinition()` antes do `upsert`.

