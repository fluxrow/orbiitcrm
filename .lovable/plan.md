

# Fix: Popup "Criar Grupo de Envio" estourando

## Problema

O Dialog "Criar Grupo de Envio" está renderizado **dentro** do wizard (que já é um modal/dialog), causando problemas de overflow e z-index — o popup estoura visualmente.

## Correção

Em `src/components/orbit/CampaignWizard.tsx`:

1. **Mover o Dialog para fora do fluxo de abas** — renderizá-lo no nível raiz do componente (fora do conteúdo do wizard) para evitar problemas de z-index e overflow com modais aninhados.

2. **Adicionar `z-[60]` ao DialogContent** para garantir que fique acima do wizard (z-50).

3. **Adicionar `max-h-[80vh] overflow-y-auto`** ao conteúdo do dialog para que não ultrapasse a viewport em telas menores.

4. **Limitar a ScrollArea** da lista de prospects a `h-[180px]` para manter o dialog compacto.

Alteração localizada em ~10 linhas no mesmo arquivo.

