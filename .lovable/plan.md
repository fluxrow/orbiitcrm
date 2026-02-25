

# Diagnostico: Erro 401 no `invite-org-user`

## Causa identificada

Os logs mostram que a funcao `invite-org-user` esta retornando **HTTP 401** em todas as chamadas POST recentes.

A funcao esta configurada com `verify_jwt = true` no `config.toml`, o que significa que o gateway valida o JWT **antes** de passar para o codigo da funcao. Se o token estiver expirado ou com problema, a requisicao e rejeitada com 401 antes mesmo do codigo executar.

Porem, a funcao **ja faz sua propria validacao de autenticacao** nas linhas 8-17 (verifica header, cria client, chama `getUser()`). Isso e uma **dupla validacao** desnecessaria que impede a funcao de retornar mensagens de erro mais claras.

## Padrao do projeto

Outras funcoes criticas que fazem validacao manual de auth ja usam `verify_jwt = false`:
- `create-empresa` 
- `create-master-user`
- `add-empresa-user`
- `orbit-search-leads`

## Correcao proposta

| Arquivo | Alteracao |
|---|---|
| `supabase/config.toml` | Alterar `invite-org-user` para `verify_jwt = false` |

Isso alinha com o padrao do projeto e permite que a funcao gerencie a autenticacao internamente, retornando erros mais descritivos em vez do 401 generico do gateway.

