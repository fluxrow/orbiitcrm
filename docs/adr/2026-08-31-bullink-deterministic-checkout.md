# ADR — Checkout determinístico da Bullink

- Status: aprovado para implementação
- Data: 2026-08-31
- Decisão solicitada por: operação Orbit

## Contexto

Reincidências de preço e fechamento mostraram que prompt e geração livre não são
suficientes para proteger uma etapa financeira. O código já possui isolamento
por tenant, estado comercial e dados oficiais configuráveis.

## Decisão

Adotar a alternativa C descrita em
`docs/architecture/BULLINK_DETERMINISTIC_CHECKOUT_V2.md`: uma máquina de saída
determinística, tenant-scoped, para aceite e escolha de pagamento. A IA continua
responsável até enviar os dados oficiais; o handoff ocorre no comprovante pelo
fluxo já existente.

## Perspectivas validadas

- Produto: elimina a promessa vazia “vou enviar os dados” e conduz a compra.
- Arquitetura: preserva o motor compartilhado e não cria estado paralelo.
- Segurança: nenhum dado de pagamento é inventado ou hardcoded; configuração
  incompleta falha fechado.
- Operação: Fernando é notificado sem perder a continuidade automática.

## Consequências

- O modelo deixa de decidir o texto de checkout da Bullink.
- Aceite comercial não equivale mais a transferência imediata nesse tenant.
- O monitor passa a exigir a nova versão de runtime.
- Não há schema, migration, reprocessamento ou envio retroativo.
