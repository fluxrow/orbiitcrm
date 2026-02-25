

# Corrigir erro na geração de template com IA

## Problema identificado

O erro "Edge Function returned a non-2xx status code" ocorre porque o `supabase.functions.invoke` do SDK trata **qualquer resposta non-2xx como erro genérico**. Quando a edge function retorna status 401, 500, etc., o SDK:
- Define `error` como um objeto `FunctionsHttpError` com mensagem genérica
- Ainda coloca o body da resposta em `data`

O código atual faz `if (error) throw error`, que descarta a mensagem de erro real e mostra apenas "Edge Function returned a non-2xx status code".

Além disso, como `verify_jwt = true` no config.toml, se a sessão do usuário estiver expirada, o **gateway do Supabase** rejeita a chamada com 401 antes mesmo de a function executar — e os logs ficam vazios.

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/pages/orbit/TemplatesPage.tsx` | Corrigir `handleGenerateAi` para extrair a mensagem de erro real do `data` quando `error` é um `FunctionsHttpError`, em vez de lançar o erro genérico |
| `supabase/functions/orbit-ai-generate-template/index.ts` | Mudar respostas de erro para retornar **status 200** com `{ ok: false, error: {...} }` no body — padrão envelope já usado no projeto. Isso evita que o SDK trate como erro e permite que o frontend leia a mensagem correta |

### Detalhes

**Abordagem: padronizar respostas com status 200 + envelope**

Seguindo o padrão `api-envelope` já estabelecido no projeto (`_shared/responses.ts`), a edge function deve retornar sempre status 200 com o envelope `{ ok: false, error: {...} }` para erros de negócio (validação, auth inválido, AI error). Apenas erros inesperados mantêm status 500.

Isso resolve o problema porque `supabase.functions.invoke` só trata como `error` respostas non-2xx. Com status 200, o `data` conterá o envelope e o frontend pode verificar `data.ok`.

**Edge function — mudanças:**
- Auth errors (401) → status 200 + `{ ok: false, error: { code: "AUTH_REQUIRED" } }`
- Validation errors (400) → status 200 + `{ ok: false, error: { code: "VALIDATION_ERROR" } }`
- AI errors → status 200 + `{ ok: false, error: { code: "AI_ERROR" } }`
- Rate limit (429) e Payment (402) mantêm status real para que o frontend possa reagir especificamente

**Config.toml — mudança:**
- Alterar `verify_jwt = false` para que a function gerencie auth manualmente (já faz isso no código). Isso evita que o gateway rejeite a chamada antes da function executar.

**Frontend — melhorar error handling:**
- Verificar `data?.ok === false` antes de `error`
- Extrair mensagem de `data?.error?.message`
- Tratar 429 e 402 com mensagens específicas

