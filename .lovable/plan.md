

# Ajustar tags de envio para CAIXA ALTA

## Problema
As variáveis `{{nome}}`, `{{nome_fantasia}}`, etc. são substituídas com o valor exato do banco de dados, sem conversão para caixa alta. O usuário quer que os nomes apareçam em MAIÚSCULAS nas mensagens enviadas.

## Solução
No arquivo `supabase/functions/send-orbit-campaign/index.ts`, aplicar `.toUpperCase()` nos valores das variáveis ao montar o mapa de substituição (linhas 252-259):

```typescript
const variaveis: Record<string, string> = {
  "{{nome}}": (prospect.nome_razao || "").toUpperCase(),
  "{{nome_fantasia}}": (prospect.nome_fantasia || "").toUpperCase(),
  "{{email}}": prospect.email_principal || "",
  "{{telefone}}": prospect.telefone || prospect.whatsapp || "",
  "{{cidade}}": (prospect.cidade || "").toUpperCase(),
  "{{segmento}}": (prospect.segmento || "").toUpperCase(),
};
```

Também ajustar a linha 299 do assunto do email:
```typescript
subject: assunto.replace(/{{nome}}/g, (prospect.nome_razao || "").toUpperCase()),
```

> Email e telefone permanecem sem alteração pois não faz sentido aplicar uppercase nesses campos.

## Arquivo alterado
| Arquivo | Ação |
|---|---|
| `supabase/functions/send-orbit-campaign/index.ts` | `.toUpperCase()` nos valores de nome, nome_fantasia, cidade e segmento |

