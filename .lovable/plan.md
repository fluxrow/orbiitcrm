

# Impedir cadastros duplicados na area de trial

## Problema
A imagem mostra 3 registros do mesmo usuario (mesmo email) na tabela de pre-cadastros. O sistema permite multiplas solicitacoes sem validacao de duplicidade.

## Causa
A Edge Function `auto-approve-trial` verifica duplicidade apenas em `saas_invites`, mas nao em `trial_requests`. Alem disso, o formulario publico `/trial` nao faz nenhuma validacao previa.

## Correcoes propostas

### 1. Edge Function `auto-approve-trial` — Verificar duplicidade em `trial_requests`
Antes de inserir, verificar se ja existe um `trial_request` com o mesmo email que esteja `pending` ou `approved`. Se existir, retornar erro informativo.

```
Linha ~92, apos normalizar o email:
- Consultar trial_requests WHERE email = email AND status IN ('pending', 'approved')
- Se encontrar, retornar erro: "Ja existe uma solicitacao para este e-mail."
```

### 2. Formulario `/trial` (TrialPage.tsx) — Feedback claro ao usuario
O formulario ja exibe o erro retornado pela API. A correcao no backend ja sera suficiente para mostrar a mensagem adequada ao usuario.

### 3. Limpeza dos registros duplicados existentes
Opcao para o admin excluir manualmente os duplicados pela interface (ja possui RLS de DELETE para super_admin).

## Detalhes tecnicos

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/auto-approve-trial/index.ts` | Adicionar verificacao de duplicidade em `trial_requests` por email + status antes da linha 107 |

A verificacao sera inserida logo apos a checagem de `saas_invites` (linha 95-105), adicionando:

```typescript
const { data: existingTrial } = await supabase
  .from("trial_requests")
  .select("id")
  .eq("email", email)
  .in("status", ["pending", "approved"])
  .limit(1)
  .maybeSingle();

if (existingTrial) {
  return fail(ErrorCodes.VALIDATION_ERROR, "Já existe uma solicitação para este e-mail. Aguarde o processamento ou entre em contato.", 409);
}
```

Isso impede duplicatas tanto via formulario publico quanto via botao "Ativar" do admin (que reutiliza a mesma funcao).

