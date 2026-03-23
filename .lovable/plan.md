

# Fix: Campanha usando número ao invés do nome do prospect

## Problema
Os prospects na imagem têm `nome_razao` preenchido com o número de telefone (ex: "21968534154" ao invés de um nome real). Quando a campanha substitui `{{nome}}`, usa esse valor, resultando em "Ola 21968534154, tudo bem?".

**Causa raiz dupla:**
1. **Importação/criação**: prospects foram cadastrados com telefone no campo `nome_razao`
2. **Envio de campanha**: o `send-orbit-campaign` não verifica se `nome_razao` parece ser um número de telefone antes de usar como `{{nome}}`

## Solução

### 1. Fallback inteligente no envio de campanha
**`supabase/functions/send-orbit-campaign/index.ts`** — Adicionar função que detecta se `nome_razao` é um telefone e usa fallback:

```typescript
function getDisplayName(prospect: any): string {
  const nome = prospect.nome_razao || "";
  // Se nome_razao é só dígitos ou começa com "WhatsApp", usar nome_fantasia ou vazio
  const isPhoneNumber = /^\d{8,}$/.test(nome.replace(/\D/g, "")) && nome.replace(/\D/g, "").length >= 8;
  const isWhatsAppPlaceholder = nome.startsWith("WhatsApp ");
  
  if (isPhoneNumber || isWhatsAppPlaceholder) {
    return prospect.nome_fantasia || "";
  }
  return nome;
}
```

Usar essa função na montagem de variáveis (linha 253):
```typescript
"{{nome}}": (getDisplayName(prospect)).toUpperCase(),
```

### 2. Mesmo fallback no webhook ao criar prospects
**`supabase/functions/orbit-webhook/index.ts`** — Já usa `"WhatsApp ${normalizedPhone}"` (linha 258), que é correto. Mas o `orbit-ai-agent` deveria atualizar `nome_razao` quando o lead informa o nome real. Isso já é feito via `dados_extraidos`.

### 3. Fallback na lista de Conversas
**`src/pages/orbit/ConversasPage.tsx`** — Linhas 268 e 280 já usam `prospect?.nome_razao || telefone_whatsapp`. Adicionar fallback para `nome_fantasia`:

```typescript
(c.prospect as any)?.nome_razao && !/^\d{8,}$/.test((c.prospect as any).nome_razao.replace(/\D/g, "")) 
  ? (c.prospect as any).nome_razao 
  : (c.prospect as any)?.nome_fantasia || c.telefone_whatsapp
```

## Arquivos modificados
- `supabase/functions/send-orbit-campaign/index.ts` — fallback de nome no envio
- `src/pages/orbit/ConversasPage.tsx` — fallback de nome na lista de conversas

