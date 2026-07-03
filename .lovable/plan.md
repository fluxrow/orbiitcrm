
## Objetivo

Três reforços à espinha dorsal do Orbit Core Flow:

1. **Botão "Instanciar Core Flow"** — 1 clique cria o fluxo no tenant atual, já ligado ao template oficial e com as variáveis do cliente resolvidas.
2. **Blindar templates com badge "Oficial"** — edição livre bloqueada; só variações controladas (trocar templates de mensagem e prompts de IA).
3. **Import de `.flow.json` mais rígido** — valida versão e placeholders contra a whitelist do tenant antes de gravar.

---

## Parte 1 — Botão "Instanciar Core Flow"

**Onde:** `src/pages/OrbitFlowsPage.tsx` (header, ao lado de "Novo fluxo") e também um card destacado quando o tenant ainda não tem nenhum fluxo baseado no `[CORE]`.

**Comportamento:**
- Busca o template com `is_official = true` e nome iniciando com `[CORE]` via `useAllFlowTemplates`.
- Se o tenant já tem um fluxo com `template_id` daquele core → mostra "Core Flow já instalado" com link para editar.
- Se não: abre um `ConfirmDialog` mostrando as variáveis que serão injetadas (nome da empresa, telefone do vendedor default, link de agendamento default) com inputs pré-preenchidos a partir de `orbit_empresas` / `pe_users` / `orbit_integrations_config`.
- Ao confirmar, chama a mutation existente `useCreateFlowFromTemplate` (arquivo `useOrbitFlows.ts`) passando o template do core; em seguida roda um `patchFlowDefinition` que percorre `actions[]` e substitui os placeholders `{{empresa.nome}}`, `{{vendedor.telefone}}`, `{{link_agendamento}}` em `action_config` (JSON deep-clone).
- Toast + redireciona para o editor do fluxo criado (`/{slug}/flows/{id}`).

**Novos arquivos:**
- `src/components/orbit/InstantiateCoreFlowButton.tsx` — botão + dialog.
- `src/hooks/useInstantiateCoreFlow.ts` — carrega variáveis do tenant, clona definição, aplica substituições, chama a mutation.

**Sem migration** — reaproveita `is_official`, `orbit_flow_templates` e `orbit_flows` já existentes.

---

## Parte 2 — Bloquear edição linha a linha de templates "Oficiais"

**Regra:** um template com `is_official = true` não pode ter sua definição JSON alterada, nem ser renomeado, duplicado como cópia editável ou excluído. Só é permitido:
- Ativar / desativar (Switch).
- Exportar `.flow.json`.
- Instanciar em um tenant (Parte 1).
- Editar **apenas** metadados de exibição controlados: nome dos templates de mensagem referenciados e slugs dos agentes de IA — via um novo modo "Configurar variações".

**Alterações em `FlowTemplatesManager.tsx`:**
- Se `t.is_official`:
  - Botão "Editar" (Pencil) vira "Configurar variações" (`Settings2`) → abre novo `<OfficialTemplateVariationsDialog />`.
  - Botão "Duplicar" fica desabilitado com tooltip "Templates oficiais são somente leitura — use Instanciar".
  - Botão "Excluir" fica desabilitado com tooltip "Templates oficiais não podem ser excluídos".
- `TemplateEditorDialog` recebe `readOnly` quando abrir um oficial (defesa em profundidade). Textarea da definição fica `readOnly`, botão "Salvar" oculto.

**Guard no back-end (defesa em profundidade):**
- Migration curta adicionando uma função `public.prevent_official_flow_template_edit()` e um trigger `BEFORE UPDATE OR DELETE ON orbit_flow_templates` que bloqueia se `OLD.is_official = true` E (a) `DELETE`, ou (b) `UPDATE` mudou `nome`, `descricao`, `categoria`, `definicao`. Continua permitindo `ativo` toggle. Bypass: `service_role` (para permitir seed/broadcast).

**Novo componente:**
- `src/components/orbit/OfficialTemplateVariationsDialog.tsx` — lê `definicao`, extrai referências a templates de mensagem (`send_whatsapp_template`, `send_email_template`) e a agentes IA (`toggle_ai_agent`) e mostra selects/dropdowns para trocar apenas esses IDs/slugs, salvando de volta em `definicao` com um novo `useUpdateOfficialVariations` que passa por edge function `orbit-flow-template-variation` (usa service role, valida que só campos permitidos mudaram).

**Nova edge function:** `supabase/functions/orbit-flow-template-variation/index.ts` — recebe `{ template_id, variations: { [action_path]: { template_id?, agent_slug? } } }`, carrega o template, aplica só nesses paths, salva. CORS + JWT verify em código + Zod.

---

## Parte 3 — Import `.flow.json` com validação de versão e whitelist

**Alterações em `src/lib/flowTemplateSchema.ts`:**
- Constante `SUPPORTED_IMPORT_VERSIONS = [1]`; `parseTemplateImport` retorna `{ ok: false, error: "Versão X não suportada. Suportadas: 1" }` quando fora da lista. Hoje já é `z.literal(1)` — trocar para `z.number().int()` + checagem manual, com mensagem clara.
- Nova função `validateImportPlaceholders(definicao, whitelist)` que percorre `actions[]` recursivamente, extrai todos os `{{...}}` de valores string em `action_config` e retorna `{ unknown: string[], usedTemplateIds: string[], usedAgentSlugs: string[] }`.
- Nova função `validateImportAgainstTenant(def, ctx)` que compara `usedTemplateIds` com IDs disponíveis (`orbit_message_templates` do tenant), `usedAgentSlugs` com `orbit_ai_config` daquele tenant, e placeholders desconhecidos contra `TEMPLATE_PLACEHOLDER_WHITELIST` (mais `payload.*` e `custom.*`).

**Alterações em `FlowTemplatesManager.tsx` → `handleImport`:**
- Depois do `parseTemplateImport`, roda `validateImportAgainstTenant`. Se houver `unknown placeholders`, `missing_templates` ou `missing_agents`, abre um novo `<ImportPreviewDialog />` listando cada problema em vermelho e as ações compatíveis em verde. O botão "Importar assim mesmo" só é habilitado se não houver **erros bloqueantes** (placeholders desconhecidos = warn; templates/agentes ausentes = bloqueante, com opção "Mapear agora" que abre dropdowns para escolher substitutos existentes).
- Ao confirmar, aplica o mapping (substitui IDs/slugs no `definicao`) e chama `upsert.mutate` como hoje.

**Novo arquivo:**
- `src/components/orbit/ImportPreviewDialog.tsx` — modal com três seções (Placeholders, Templates de mensagem, Agentes IA) e um botão "Importar" desabilitado enquanto houver bloqueio.

---

## Documentação

- `docs/CORE_FLOW.md`: nova seção **"Instanciar em um tenant"** com screenshot do botão, tabela de variáveis injetadas e exemplo de patch.
- `docs/CORE_FLOW.md`: nova seção **"Templates Oficiais são imutáveis"** explicando o trigger + o dialog de variações.
- `docs/CORE_FLOW.md`: nova seção **"Import Validado"** documentando versões suportadas, whitelist de placeholders e o fluxo de mapping.
- `src/pages/DocumentacaoPage.tsx` (bloco "Orbit Core Flow"): adiciona 3 subitens correspondentes com o mesmo conteúdo resumido, mais o passo "Clique em **Instanciar Core Flow** na página Fluxos" no Guia de Configuração de 5 min.

---

## Fora de escopo

- Versionamento histórico dos templates oficiais (v1 / v2 / rollback).
- Editor visual de placeholders por nível de aninhamento.
- Marketplace público de `.flow.json`.
- Multi-idioma dos templates.

## Ordem de execução

1. Migration: trigger `prevent_official_flow_template_edit`.
2. Schema + helpers de validação em `flowTemplateSchema.ts` + testes unitários.
3. Edge function `orbit-flow-template-variation` + deploy.
4. `useInstantiateCoreFlow` + `InstantiateCoreFlowButton` + integração na `OrbitFlowsPage`.
5. Bloqueio na UI + `OfficialTemplateVariationsDialog`.
6. `ImportPreviewDialog` + integração em `FlowTemplatesManager`.
7. Atualização de `docs/CORE_FLOW.md` e `DocumentacaoPage.tsx`.
8. Teste E2E adicional cobrindo: instanciar, tentar editar oficial (deve falhar), importar `.flow.json` com placeholder desconhecido (deve pedir mapping).
