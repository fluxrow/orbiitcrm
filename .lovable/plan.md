

# Variáveis de template com capitalização de nomes próprios

## Problema
Atualmente, as variáveis `{{nome}}`, `{{empresa}}`, `{{nome_fantasia}}`, `{{cidade}}` e `{{segmento}}` são convertidas para CAIXA ALTA com `.toUpperCase()` no envio de campanhas. O correto é usar Title Case (primeira letra maiúscula de cada palavra), seguindo a regra ortográfica brasileira para nomes próprios.

## Mudança

### `supabase/functions/send-orbit-campaign/index.ts` (~linha 287-295)

Criar uma função `toTitleCase` que capitalize a primeira letra de cada palavra, mantendo preposições/artigos em minúscula (de, da, do, das, dos, e, em, etc.):

```typescript
const toTitleCase = (str: string): string => {
  if (!str) return "";
  const lower = ["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "a", "o", "as", "os", "com", "para", "por"];
  return str
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (i > 0 && lower.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
};
```

Trocar `.toUpperCase()` por `toTitleCase()` nas variáveis de nome próprio:

```typescript
const variaveis: Record<string, string> = {
  "{{nome}}": toTitleCase(getDisplayName(prospect)),
  "{{empresa}}": toTitleCase(getCompanyName(prospect)),
  "{{nome_fantasia}}": toTitleCase(prospect.nome_fantasia || ""),
  "{{email}}": prospect.email_principal || "",
  "{{telefone}}": prospect.telefone || prospect.whatsapp || "",
  "{{cidade}}": toTitleCase(prospect.cidade || ""),
  "{{segmento}}": toTitleCase(prospect.segmento || ""),
};
```

Exemplos de resultado:
- `"JOÃO DA SILVA"` → `"João da Silva"`
- `"SAO PAULO"` → `"São Paulo"` (nota: acentuação depende do dado original)
- `"EMPRESA DE TECNOLOGIA"` → `"Empresa de Tecnologia"`

## Arquivo modificado
- `supabase/functions/send-orbit-campaign/index.ts`

