

# Fix: Texto branco e perda de formatação ao colar no editor de email

## Problemas identificados

1. **Texto branco sobre fundo branco**: A classe `prose` do Tailwind herda a cor do tema (que pode ser branca em dark mode). O editor tem `bg-white` mas o texto não tem cor forçada escura.

2. **Perda de formatação ao colar**: O TipTap por padrão com StarterKit processa o conteúdo colado mas pode remover estilos inline. Precisamos garantir que `TextStyle` e `Color` sejam preservados no paste.

## Solução

### `src/components/orbit/EmailTemplateEditor.tsx`

1. **Forçar texto escuro no editor**: Adicionar `text-black` na div do editor e no `editorProps.attributes.class` para garantir que o texto seja sempre escuro independente do tema.

2. **Melhorar preservação de formatação ao colar**: Adicionar `handlePaste` customizado no `editorProps` que preserva o HTML formatado, ou configurar `transformPastedHTML` para manter estilos inline de cor e fonte.

Mudanças específicas:

- **Linha 85-88** (editorProps): Adicionar `text-black` à classe do editor
```tsx
editorProps: {
  attributes: {
    class: "prose prose-sm max-w-none min-h-[300px] focus:outline-none p-6 text-black",
  },
},
```

- **Linha 265** (div container do editor): Adicionar `text-black` 
```tsx
<div className="bg-white text-black min-h-[350px]">
```

- **Linhas 69-79** (extensions): Adicionar `FontFamily` extension (via `@tiptap/extension-font-family`) para preservar fontes coladas, e configurar `parseHTML` rules no StarterKit para aceitar estilos inline

- **Alternativa mais simples para paste**: Adicionar no `editorProps` um `transformPastedHTML` que preserva os estilos de formatação ao limpar apenas tags perigosas (script, etc.) mas mantendo `style` attributes de font, color, etc.

## Arquivos modificados
- `src/components/orbit/EmailTemplateEditor.tsx` — forçar cor escura + preservar formatação no paste

