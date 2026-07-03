## Objetivo

Formalizar o **Orbit Core Flow** — o template mestre que toda nova conta recebe — junto com:
1. Melhorias no editor de condições aninhadas (AND/OR).
2. Validação inline no editor de templates de mensagem.
3. Import/Export de templates de fluxo (JSON) — para replicar o Core em qualquer tenant.
4. Atualização da documentação (`DocumentacaoPage`) e criação de um **Guia de Configuração** in-app.

---

## Parte 1 — Orbit Core Flow (template mestre)

### 1.1 Seed do template no banco
Migration nova que insere (ou faz `upsert` por `nome`) o template `[CORE] Orbit Core Flow` em `orbit_flow_templates`, marcado `is_global=true`, `is_official=true` (nova coluna booleana). Estrutura JSON do `definicao`:

```text
trigger: orbit_lead_recebido
actions:
  1. switch  → prospect.origem
       case "instagram|meta"  → set_tag: ORIGEM_ADS
       case "site|typebot"    → set_tag: ORIGEM_SITE
       default                → set_tag: ORIGEM_MANUAL
  2. ai_agent → prompt_slug: CORE_QUALIFICACAO_INICIAL
  3. if/else → prospect.qualificado == true
       THEN:
         4. auto_create_deal_for_prospect
         5. send_vendedor_notification (admin)
       ELSE:
         6. if/else → prospect.renda_baixa == true
              THEN: send_template  slug=[CORE] OFFER_LOW_TICKET
              ELSE: send_template  slug=[CORE] NURTURING_GENERICO
  7. delay 3h (no_reply)
  8. ai_agent → prompt_slug: CORE_FOLLOWUP
  9. switch → status_conversa
       case "aberta"    → schedule_recheck 24h
       case "encerrada" → end_flow
 10. if/else → status_conversa == "handoff"
       THEN: transferencia_vendedor + zapi_notify_admin
```

O JSON usa os mesmos tipos já suportados por `useOrbitFlows.ts` / `orbit-flow-executor` (nenhuma nova ação backend).

### 1.2 Templates de mensagem "[CORE]"
Mesma migration insere no `orbit_message_templates` (escopo `empresa_id = NULL` = global do master tenant) com `slug` fixo:
- `[CORE] Abordagem Inicial`
- `[CORE] Quebra de Objeção`
- `[CORE] OFFER_LOW_TICKET` (downsell)
- `[CORE] NURTURING_GENERICO`
- `[CORE] Follow-up 3h`

Corpo com placeholders `{{lead.nome}}`, `{{empresa.nome}}`, `{{link_agendamento}}`. Os slugs referenciados pelo Core Flow batem 1:1.

### 1.3 Instanciação automática no onboarding
No fluxo `orbit-onboarding-*` (ou trigger de criação de `saas_empresa`), acrescentar step **"aplicar Core Flow"**: chama a mesma rotina do wizard "Novo Fluxo" com `template_id = core_flow_id`, gerando um `orbit_flows` + `orbit_flow_actions` reais na conta nova, já ativos.

Nova opção no `FlowTemplatesManager`: badge **"Oficial"** + botão **"Aplicar em todas as contas ativas"** (dispara edge function `orbit-flow-broadcast-core`).

---

## Parte 2 — Import / Export JSON de templates

- Novo botão no `FlowTemplatesManager` por linha: **Exportar** → baixa `{nome}.flow.json` com `{ nome, descricao, categoria, definicao, version: 1 }`.
- Novo botão global **Importar** → dialog aceita `.json`, valida schema com Zod (`FlowTemplateSchemaV1`), preview das ações e confirmação → cria novo template.
- Suporte a re-importação: se `nome` bater, oferecer "Atualizar existente" vs "Criar cópia".

---

## Parte 3 — UI de condições aninhadas (AND/OR)

Refino em `FlowIfElseEditor` / `FlowConditionsDialog`:
- Cada grupo ganha **barra lateral colorida** (AND=azul, OR=âmbar) + rótulo `TODAS as regras` / `QUALQUER regra`.
- Indentação clara por nível + contador (`Nível 2/3`).
- Botão "colapsar grupo" para grupos com >3 regras.
- Ao editar regra existente: manter o `id` estável (não recriar), evitando reset do valor ao trocar operador.
- Validação inline: destaca em vermelho regras com `field` ou `value` vazios; bloqueia salvar do fluxo se houver regra inválida (toast + scroll até primeira).
- Testes manuais: renomear campo, trocar operador, mover regra entre grupos, remover grupo com filhos.

---

## Parte 4 — Validação do editor inline de templates

No `TemplateSelectField` + `TemplateQuickCreateDialog`:
- Schema Zod: `nome ≥ 3`, `corpo ≥ 10`, `canal` obrigatório.
- Parser de placeholders `{{...}}`: extrai variáveis do corpo e valida contra whitelist (`lead.*`, `empresa.*`, `deal.*`, `link_*`). Placeholders desconhecidos → warning amarelo (não bloqueia).
- Se o template selecionado num action estiver **inativo** ou **deletado**, mostrar `AlertCircle` vermelho no card da action e impedir salvar o fluxo.
- Preview live com placeholders substituídos por exemplos (mock lead).

---

## Parte 5 — Documentação e Guia de Configuração

### 5.1 `DocumentacaoPage` (usuário final)
Nova seção **"Orbit Core Flow"** com:
- O que é / por que existe.
- Diagrama ASCII do fluxo (mesma árvore da Parte 1).
- Lista dos templates `[CORE]` e placeholders esperados.
- Como customizar (troca de templates, prompt IA) sem quebrar a estrutura.
- FAQ: "posso apagar uma ação?", "como voltar ao padrão?".

### 5.2 Novo **Guia de Configuração in-app** (`/{slug}/setup-guide`)
Wizard de 5 passos com checklist persistente (`orbit_client_onboardings`):
1. Conectar WhatsApp (Z-API).
2. Configurar identidade da IA (prompt + tom).
3. Revisar templates `[CORE]` (renomear mentoria, links).
4. Ativar o Core Flow (toggle).
5. Enviar lead de teste.

Cada passo tem: descrição, link direto pra tela, botão "marcar como feito", indicador de progresso. Pensado para **onboarders externos** — texto sem jargão técnico.

### 5.3 README interno (`docs/CORE_FLOW.md`)
Para devs/onboarders: descreve o schema JSON do template, como editar via migration, como rodar o broadcast, e o contrato dos slugs `[CORE]`.

---

## Detalhes técnicos

- **Migration**: `orbit_flow_templates.is_official boolean default false` + `unique(nome) where is_official`; seed via `INSERT ... ON CONFLICT`.
- **GRANTs**: já cobertos pelas policies existentes de `orbit_flow_templates` e `orbit_message_templates`.
- **Edge function nova**: `orbit-flow-broadcast-core` (super-admin only) — itera `saas_empresa` ativas e instancia o Core Flow onde ainda não existe.
- **Zod schemas** novos em `src/lib/flowTemplateSchema.ts` (compartilhado import/export + validação inline).
- **Rota nova**: `src/pages/SetupGuidePage.tsx` + entry no `OrbitSidebar` (badge "Novo").
- **Sem breaking changes** no executor: todas as ações usadas já existem.

## Ordem de execução

1. Migration seed (Core Flow + templates `[CORE]` + coluna `is_official`).
2. Import/Export JSON no `FlowTemplatesManager`.
3. Broadcast edge function + botão "Aplicar em todas as contas".
4. Refino UI condições aninhadas.
5. Validação inline de templates.
6. Documentação + Guia de Configuração.

## Fora de escopo

- Versionamento histórico de templates (v2, v3).
- Editor visual estilo n8n.
- Marketplace público de fluxos.
