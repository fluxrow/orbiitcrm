# Gate obrigatório de etapa comprovada

Uma etapa do Orbit só pode ser marcada como concluída quando todos os itens
aplicáveis abaixo tiverem evidência registrada. Qualquer falha crítica mantém a
etapa bloqueada e impede o avanço funcional.

## Implementação

- [ ] Escopo e tenant-alvo estão explícitos.
- [ ] Mudanças compartilhadas preservam os demais tenants por padrão.
- [ ] Migrações são idempotentes e têm estado inicial seguro.
- [ ] Ações externas possuem idempotência, auditoria e falha fechada.
- [ ] Feature flags, fluxos ou envios novos permanecem inativos até homologação.

## Validação técnica

- [ ] Testes unitários e contratos críticos passam sem falhas.
- [ ] TypeScript e `deno check` passam nos arquivos afetados.
- [ ] Build termina com sucesso, ou o bloqueio ambiental é diagnosticado e
      resolvido antes da aprovação.
- [ ] `git diff --check` passa e o diff não contém arquivos fora do escopo.
- [ ] Migração é revisada contra o schema real antes de ser aplicada.

## Homologação operacional

- [ ] Estado real do Lovable Cloud é inspecionado antes e depois.
- [ ] Teste sandbox/dry-run comprova o caminho sem comunicação real.
- [ ] Não existem mensagens, filas ou eventos antigos elegíveis por acidente.
- [ ] Isolamento do tenant é comprovado no banco e na interface.
- [ ] Monitoramento, auditoria e rollback estão definidos.

## Publicação

- [ ] Commit e PR identificados.
- [ ] Checks da PR estão verdes.
- [ ] Migration e Edge Functions compatíveis são publicadas juntas.
- [ ] Ativação canário ocorre separadamente do deploy.
- [ ] Inspeção pós-deploy confirma o comportamento esperado.

## Decisão

- **APROVADA:** todos os itens críticos passam e não há pendência operacional.
- **BLOQUEADA:** existe qualquer falha crítica ou evidência ausente.
- **ROLLBACK:** uma regressão pós-deploy exige desativação do canário e reversão
  do commit/migration conforme o runbook da etapa.
