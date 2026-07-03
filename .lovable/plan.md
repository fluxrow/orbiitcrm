## Objetivo

Criar um Playwright golden path que exercita o `FlowTemplatesManager` na UI real, exportando e reimportando o `[CORE] Orbit Core Flow` e provando byte-a-byte que nada muda no reload — incluindo placeholders reconhecidos e prompts da IA. Rodar em CI headless com falha imediata em qualquer divergência.

## Escopo

### 1. Novo spec: `tests/e2e/golden-core-flow-roundtrip.spec.ts`

Reusa autenticação super-admin (mesmo padrão dos outros `golden-*.spec.ts`), navega até `/{slug}/config` → aba **Templates de Fluxo**.

Três `test()` no mesmo `describe.serial` (compartilham o download inicial):

**a) `exporta o [CORE] Orbit Core Flow e valida assinatura do arquivo`**
- Localiza o card do template com badge "Oficial" e nome `[CORE] Orbit Core Flow`.
- Clica em **Exportar** e captura o download via `page.waitForEvent("download")`.
- Lê o JSON, valida com `parseTemplateImport`, guarda `originalExport` no escopo do describe.
- Assert: `version === 1`, `nome`, `categoria === "Core"`, `definicao.actions.length === 7`.

**b) `importa o mesmo arquivo → atualiza o existente (sem criar cópia)`**
- Grava `originalExport` em `/tmp/core-flow.flow.json`.
- Clica em **Importar**, faz `setInputFiles` no `<input type=file>` (via `importInputRef`).
- No `ImportPreviewDialog`, assert: mostra badge "atualizará existente" e **NÃO** sufixo `(import)`. Confirma.
- Aguarda toast "Template atualizado".
- Assert UI: continua existindo **exatamente 1** card com nome `[CORE] Orbit Core Flow` (sem `(import)` nem `(1)`).
- Assert DB (via `supabase.from("orbit_flow_templates").select` no test runner): `count === 1` para esse nome, `is_official = true` mantido.

**c) `round-trip preserva placeholders reconhecidos e prompts da IA`**
- Reexporta pós-import → `reimportedExport`.
- Deep-equal `originalExport.definicao` vs `reimportedExport.definicao` via `expect(...).toEqual(...)`.
- Extrai placeholders de todo `action_config` recursivamente com `inspectFlowDefinition` e assert:
  - `inspection.placeholders` idêntico antes/depois (mesma ordem/set).
  - `inspection.unknownPlaceholders.length === 0`.
- Extrai prompts de IA (nós `toggle_ai_agent` → `action_config.prompt_slug` e qualquer `system_prompt`/`user_prompt` inline) via walker; assert deep-equal antes/depois. Cobre `CORE_QUALIFICACAO_INICIAL` e `CORE_FOLLOWUP`.
- Falha imediata (sem retry) na primeira divergência via `expect.soft` desligado + `test.fail()` explícito.

### 2. Helpers

- `tests/e2e/_helpers/coreFlow.ts`: `openTemplatesTab(page)`, `downloadCoreFlowExport(page)`, `importFlowFile(page, path)`, `readCoreFlowFromDb()` (usa `SUPABASE_URL` + anon do env já lido por outros specs).
- Sem alteração de código de produção — o botão Exportar / Importar já existe em `FlowTemplatesManager.tsx`.

### 3. CI

- `.github/workflows/e2e-core-flow.yml`: job `ubuntu-latest`, Node 20, `bun install`, `bunx playwright install --with-deps chromium`, `bun run build && bun run preview &` (ou reuso do `webServer` — adicionar `webServer` em `playwright.config.ts` se ainda não existir para CI), `bunx playwright test tests/e2e/golden-core-flow-roundtrip.spec.ts --reporter=github`.
- `retries: 0` para esse spec (override via `test.describe.configure({ retries: 0 })`) — divergência = falha imediata, nunca mascarada por retry.
- Upload de artefatos: trace + JSON exportado em caso de falha.

### 4. Documentação

- `docs/CORE_FLOW.md`: nova seção **"Teste E2E de integridade"** explicando o spec, como rodar local (`bunx playwright test golden-core-flow-roundtrip`), o que falha significa (nunca editar template oficial manualmente no banco), e a garantia de que import de duplicata atualiza in-place.
- `src/pages/DocumentacaoPage.tsx`: adicionar item na seção Core Flow apontando para o novo teste.

## Fora de escopo

- Testar variações via `OfficialTemplateVariationsDialog` (já coberto por unit tests).
- Testar templates não-oficiais.
- Snapshot visual — só validação estrutural.

## Ordem de implementação

1. Helper `coreFlow.ts` + spec com os 3 testes.
2. Ajuste no `FlowTemplatesManager` **apenas se** o botão Exportar não emitir `download` nativo (verificar; provavelmente já emite via `URL.createObjectURL` + `<a download>`).
3. Workflow CI + `webServer` no `playwright.config.ts` se necessário.
4. Docs.
