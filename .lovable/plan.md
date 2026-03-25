

# Fix: URL de ativação errada + erro ao validar convite

## Problemas identificados

### 1. URL do email aponta para domínio errado
A função `auto-approve-trial` usa `getAppUrl()` que faz fallback para a URL de preview do Lovable (`143c37b1-...lovableproject.com`) porque a env var `APP_URL` não está configurada. O mesmo ocorre em `invite-org-user` e `create-empresa-invite`.

### 2. Erro "Edge Function returned a non-2xx status code"
A função `validate-invite` retorna HTTP 404/410/500 nos erros de negócio (`fail(..., 404)`). O SDK do Supabase intercepta status non-2xx e lança erro genérico, impedindo o frontend de ler a mensagem real. Conforme a arquitetura do projeto (envelope padronizado), erros de negócio devem retornar **status 200** com `ok: false`.

## Solução

### 1. Adicionar secret `APP_URL` = `https://orbit.fluxrow.pro`
Todas as funções que geram links de ativação/convite passarão a usar o domínio correto.

### 2. Corrigir `validate-invite` — retornar status 200 em erros de negócio
Trocar os `fail(..., 404)`, `fail(..., 410)`, `fail(..., 500)` por `fail(..., 200)` (ou sem o terceiro argumento, que default é 400 — mas aqui precisa ser 200 para o SDK não bloquear).

Alternativa mais limpa: mudar o status default do `fail` apenas nesta função, passando `200` explicitamente nos erros de negócio (INVITE_INVALID, INVITE_USED, INVITE_EXPIRED).

### 3. Atualizar fallbacks hardcoded
- `auto-approve-trial` linha 31: fallback de `id-preview--...lovable.app` para `https://orbit.fluxrow.pro`
- `invite-org-user` linha 58: fallback de `orbiitcrm.lovable.app` para `https://orbit.fluxrow.pro`
- `create-empresa-invite`: mesmo ajuste no fallback

## Arquivos

| Arquivo | Ação |
|---------|------|
| Secret `APP_URL` | Adicionar com valor `https://orbit.fluxrow.pro` |
| `supabase/functions/validate-invite/index.ts` | Trocar status 404/410/500 para 200 nos erros de negócio |
| `supabase/functions/auto-approve-trial/index.ts` | Atualizar fallback URL (linha 31) |
| `supabase/functions/invite-org-user/index.ts` | Atualizar fallback URL (linha 58) |
| `supabase/functions/create-empresa-invite/index.ts` | Atualizar fallback URL |
| `supabase/functions/accept-empresa-invite/index.ts` | Atualizar URL hardcoded na linha 16 |

