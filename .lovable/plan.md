

# Fix: Mensagens com HTML sendo exibidas como texto bruto

## Problema

Na tela de Conversas, mensagens que contêm tags HTML (`<p>`, `</p>`) estão sendo exibidas com as tags visíveis em vez de renderizadas ou removidas. Isso acontece porque a linha 293 do `ConversasPage.tsx` usa `{m.mensagem}` dentro de um `<p>`, o que escapa o HTML automaticamente.

A causa raiz é que as mensagens de campanha (ou templates de email) são salvas com formatação HTML no campo `mensagem` da tabela `orbit_mensagens`.

## Solução

Criar uma função utilitária `stripHtmlTags` que remove todas as tags HTML e converte `</p>` em quebras de linha, para exibir o conteúdo limpo no chat. Não usar `dangerouslySetInnerHTML` no chat — o contexto é WhatsApp, onde HTML não faz sentido.

### Arquivo: `src/pages/orbit/ConversasPage.tsx`

1. Adicionar função helper no topo do arquivo:
```ts
function stripHtml(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}
```

2. Na linha 293, trocar:
```tsx
<p className="text-sm">{m.mensagem}</p>
```
por:
```tsx
<p className="text-sm whitespace-pre-wrap">{stripHtml(m.mensagem || "")}</p>
```

3. Aplicar a mesma lógica ao preview na sidebar (linha ~263, `c.ultima_mensagem_preview`), caso esse campo também contenha HTML.

### Resultado
- Mensagens com HTML serão exibidas como texto limpo com quebras de linha preservadas
- Sem risco de XSS (não usa `dangerouslySetInnerHTML`)
- Sem impacto em mensagens de texto puro (a função é no-op para texto sem tags)

