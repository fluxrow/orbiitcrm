
# Vincular a lista "Contatos Paraná 2026" (e futuras antigas) ao seletor de campanha

## Diagnóstico
A importação **"Contatos Paraná 2026 - prospects_final_validated.csv"** (2.497 prospects criados em 18/05 13:14) aconteceu antes da feature de "Listas importadas" entrar no ar. Por isso ela existe em `orbit_import_history`, mas **nenhum prospect recebeu a tag `lista:*`** — daí a aba "Listas" aparecer vazia.

Confirmado no banco:
- `orbit_import_history`: 1 registro com esse nome, 2.497 sucesso, em 18/05 13:14.
- `orbit_prospects` com `tags ~ 'lista:%'` na empresa: **0**.
- `orbit_prospects` com `origem_contato='IMPORTACAO'` criados ±5 min do import: **2.474** (≈ os 2.497 menos os atualizados/merge cujo `created_at` é antigo).

## Solução

### 1. Botão de "Vincular como lista" no histórico de importações
Na página de Prospects, adicionar (ou expor, se já existir) um card "Importações recentes" lendo `orbit_import_history`. Em cada linha sem tag vinculada, mostrar botão **"Marcar como lista para campanhas"** que executa o backfill.

### 2. Backfill server-side (RPC ou query client-side)
Para o registro de `orbit_import_history` escolhido:
- Gera o `listaTag` com a mesma convenção do código novo (`lista:<slug-do-arquivo>-<YYYYMMDD-HHmm>` usando o `created_at` do registro).
- Seleciona `orbit_prospects` da mesma `empresa_id` com `origem_contato='IMPORTACAO'` e `created_at` entre `import.created_at − 10min` e `import.created_at + 10min`.
- Para cada um, adiciona a tag em `tags` (idempotente: ignora se já existir).
- Atualiza um campo opcional `detalhes_erros`/extra do `orbit_import_history` para sinalizar "vinculado" e evitar re-aplicar.

Limites e proteções:
- Janela ±10min cobre importações grandes; ajustável.
- Apenas `origem_contato='IMPORTACAO'` evita pegar prospects criados manualmente no mesmo intervalo.
- Operação respeita RLS (empresa_id).
- Confirmação no UI antes de aplicar (mostra "vai marcar N prospects como esta lista").

### 3. Resultado para o caso atual
Ao clicar em "Marcar como lista" na linha "Contatos Paraná 2026", os ~2.474 prospects ganham a tag `lista:contatos-parana-2026-prospects-final-validated-20260518-1314`. Imediatamente a aba **Listas** do wizard de campanha mostra:
> Contatos parana 2026 prospects final validated · 18/05/2026 13:14 · 2.474 elegíveis

Selecionando, o disparo vai para a lista inteira.

## Arquivos a alterar
- `src/hooks/useOrbitProspects.ts` — novo hook `useBackfillImportAsList(importId)` que executa o passo 2 acima em lote.
- `src/pages/orbit/ProspectsPage.tsx` — pequena seção "Importações recentes" (top 5 de `orbit_import_history`) com botão de vincular por linha.
- Sem mudança em schema, edge function ou no fluxo de envio.

## Critérios de aceite
- O usuário vê a importação "Contatos Paraná 2026" listada e consegue vinculá-la com 1 clique.
- Após o vínculo, a aba "Listas" do wizard exibe a lista com a contagem correta de elegíveis para o canal (email/WhatsApp).
- Re-clicar em "Marcar como lista" não duplica nada (operação idempotente).
- Importações futuras continuam sendo marcadas automaticamente, sem precisar deste botão.
