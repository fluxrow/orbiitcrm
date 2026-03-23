

# Fix: Tag {{empresa}} não substituída no envio de campanha

## Problema
O template usa `{{empresa}}` mas essa variável não existe no mapa de substituição (`variaveis`) em `send-orbit-campaign/index.ts`. O sistema só mapeia `{{nome}}`, `{{nome_fantasia}}`, `{{email}}`, `{{telefone}}`, `{{cidade}}` e `{{segmento}}`.

## Solução
Adicionar `{{empresa}}` ao mapa de variáveis na linha 267-274. A lógica de `{{empresa}}` deve seguir:

1. `nome_razao` (se não for telefone/placeholder) → nome da empresa
2. `nome_fantasia` como fallback
3. Vazio se nenhum disponível

```typescript
const variaveis: Record<string, string> = {
  "{{nome}}": getDisplayName(prospect).toUpperCase(),
  "{{empresa}}": getCompanyName(prospect).toUpperCase(),  // ← NOVO
  "{{nome_fantasia}}": (prospect.nome_fantasia || "").toUpperCase(),
  // ... restante igual
};
```

Função `getCompanyName`:
```typescript
const getCompanyName = (p: any): string => {
  const nome = p.nome_razao || "";
  const isPhone = /^\d{8,}$/.test(nome.replace(/\D/g, "")) || nome.startsWith("WhatsApp ");
  if (!isPhone && nome.trim()) return nome.trim();
  return p.nome_fantasia?.trim() || "";
};
```

## Arquivo modificado
- `supabase/functions/send-orbit-campaign/index.ts` — adicionar `{{empresa}}` ao mapa de variáveis (~5 linhas)

