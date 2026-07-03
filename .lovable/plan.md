# Painel de ajuda dentro da aba Fluxos

## Objetivo
Colocar o guia acima como um **painel colapsável** no topo da aba `/orbit/config → Fluxos`, para você e seus clientes finais consultarem sem sair da tela. Sem alterar lógica do motor de fluxos — apenas UI.

## O que será adicionado

Um novo componente `FlowHelpPanel.tsx` renderizado no topo de `FluxosTab.tsx`, **acima** do `FlowEventMap`. Estrutura:

- Card com header "Como configurar Fluxos" + botão "Mostrar/Ocultar" (colapsado por padrão, estado em `localStorage` por empresa para lembrar preferência).
- Conteúdo em 4 seções via `<Accordion>` do shadcn:
  1. **Os 3 blocos** — diagrama `Gatilho → Condições → Ações`
  2. **Escolhendo o Gatilho** — tabela com os 7 gatilhos e uso típico
  3. **Filtrando com Condições** — fonte, payload_match, exigências
  4. **Ações e vínculo com Pipeline** — catálogo + os dois padrões (A: Pipeline→Fluxo, B: Fluxo→Pipeline) com exemplos práticos
- Chip/badge de "Dicas rápidas" no rodapé: sempre criar inativo, testar pelo Mapa de Disparo, preferir `to_stage_slug`.

## Arquivos afetados

- **Criar** `src/components/orbit/FlowHelpPanel.tsx` (~150 linhas, apenas apresentação usando Card, Accordion, Badge já existentes).
- **Editar** `src/components/orbit/FluxosTab.tsx`: importar e renderizar `<FlowHelpPanel />` antes do `<FlowEventMap />`.

## Fora do escopo (posso fazer em seguida se quiser)

- Dropdown de etapas do pipeline na ação "Mover no funil" (hoje digita slug manual)
- Reorder por drag-and-drop das ações
- Página `/orbit/docs/fluxos` dedicada

## Estimativa
Mudança pequena, só frontend, sem migração nem edge function. ~1 iteração.
