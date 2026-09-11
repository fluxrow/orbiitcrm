# Trava atômica para campanhas Viver

## Objetivo
Eliminar a corrida entre workers que pode liberar duas campanhas Viver simultaneamente, sem alterar outros tenants, mensagens de IA, cotas ou gates existentes.

## Implementação
- Criar uma migration versionada que substitui `outbox_claim_batch` e registra a definição anterior em comentário para rollback.
- Dentro da função, aplicar `pg_try_advisory_xact_lock` somente ao tenant Viver antes da recuperação de leases e do claim.
- Para Viver, manter no máximo uma campanha em `processing` com lease válida e limitar a uma campanha por claim; itens não-campaign continuam seguindo a prioridade e o lote normal.
- Preservar integralmente a seleção, aging, lease recovery e semântica dos demais tenants.
- Bloquear execução dirigida de `campaign` no worker; ela deve aguardar o claim normal. Manter `ai_reply` dirigido inalterado.
- Remover a eleição insegura pelo menor ID, mantendo os gates de 30 minutos, 15/dia e fail-closed.

## Testes e validação
- Reproduzir o interleaving real: A inicia antes, B com ID menor chega depois, e somente um obtém reserva.
- Cobrir IDs invertidos, lease ativo/expirado, dois workers, lote maior que um, `ai_reply` dirigido e tenant diferente.
- Testar a migration em transação com rollback antes de aplicá-la.
- Rodar testes focados, suites relacionadas, `deno check` e build.
- Aplicar a migration pelo Lovable Cloud somente após tudo verde e publicar apenas `orbit-whatsapp-outbox-tick` se ele for alterado.

## Limites
Nenhum dado de campanha será criado, enviado ou reprocessado; nenhum gate será desativado.
