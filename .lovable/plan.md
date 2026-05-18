
# Listas por importação de CSV no disparo de campanha

## Objetivo
Quando o usuário importa um CSV em Prospects, todos os prospects daquele arquivo passam a formar uma “lista” identificável. No wizard de campanha (passo 3 – Destinatários), essas listas aparecem como opção pronta de seleção, permitindo enviar para a base inteira do arquivo em um clique.

Sem mexer em schema do banco, sem mexer em edge functions, sem mexer no envio. Tudo é resolvido por tag + UI.

## Como funciona

1. **Na importação (`useImportProspectsCSV`)**
   - Gera um identificador da lista a partir do nome do arquivo: `lista:<slug-do-arquivo>-<YYYYMMDD-HHmm>` (ex.: `lista:promotrip-base-202605-1830`). O timestamp evita colisão se o mesmo arquivo for reimportado.
   - Adiciona esse identificador como tag em todos os prospects inseridos **e** nos que sofreram merge.
   - Continua gravando em `orbit_import_history` (já existe) para auditoria.

2. **No `RecipientSelector` (passo 3 do wizard)**
   - Nova aba/seção “Listas importadas” acima de “Listas salvas”.
   - Lista derivada client-side: agrupa os prospects por tag iniciada em `lista:`; cada item mostra nome amigável (slug original do arquivo), data e quantidade de prospects elegíveis no canal escolhido.
   - Marcar uma lista adiciona todos os `prospect_ids` daquela tag ao `selected_prospect_ids` já consumido pelo wizard. Reaproveita 100% do fluxo existente de `calculateAllRecipientIds` → `orbit_campaign_recipients`.
   - Permite combinar lista importada + filtros + outros grupos, como hoje.

3. **Display do nome da lista**
   - Função utilitária `parseImportTag(tag)` → `{ id, label, importedAt }` para mostrar “Promotrip Base · 18/05 18:30 · 1.245 contatos”.

## Por que esta abordagem

- **Sem risco para o envio**: não toca em `orbit_campaign_recipients`, `send-orbit-campaign`, RLS ou edge functions.
- **Sem migração**: usa o array `tags` que já existe em `orbit_prospects` e já é filtrável.
- **Retroativo opcional**: para listas já importadas antes desta mudança, oferecer botão único “Marcar imports antigos” em Prospects que lê `orbit_import_history` e aplica a tag onde possível (fora de escopo desta entrega, anotado como follow-up).
- **Compatível com Send Groups**: continuam existindo; lista importada é uma camada a mais.

## Arquivos a alterar

- `src/hooks/useOrbitProspects.ts` — gerar `listaTag` no início da mutation; incluir em `insertPayload.tags` e no merge de `patch.tags`; retornar `listaTag` no resultado.
- `src/components/orbit/ImportProspectsDialog.tsx` — toast de sucesso com o nome da lista criada.
- `src/components/orbit/RecipientSelector.tsx` — nova seção “Listas importadas”, derivação por tag `lista:*`, seleção que injeta prospect_ids.
- `src/components/orbit/CampaignWizardContent.tsx` — nenhuma mudança de lógica (já usa `selected_prospect_ids`); apenas confirmar que o contador de destinatários reflete a seleção.

## Critérios de aceite

- Importar CSV em Prospects cria automaticamente uma lista nomeada.
- No wizard de campanha, passo Destinatários, a lista aparece selecionável com contagem correta para o canal escolhido (email vs WhatsApp, respeitando opt-out).
- Selecionar a lista e seguir para Revisão mostra o total esperado e a campanha é criada/agendada normalmente.
- Listas antigas (anteriores à mudança) continuam disponíveis via filtros/Send Groups — não regridem.
