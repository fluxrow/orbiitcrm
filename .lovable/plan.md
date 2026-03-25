

# Fix: Preview branco, preview real-time e tabulação no editor

## Problemas
1. Preview com texto branco sobre fundo branco — usa `text-foreground` que herda cor do tema dark
2. Preview já deveria atualizar em real-time mas pode não estar refletindo mudanças instantaneamente
3. Falta suporte a tabs/indentação no editor

## Mudanças

### `src/pages/orbit/EmailTemplateEditorPage.tsx`
- **Linha 312**: Trocar `text-foreground` por `text-black` na div do preview para forçar texto escuro
- **Linha 296-298**: Adicionar `text-black` nos textos do header do preview (assunto, categoria)

### `src/components/orbit/EmailTemplateEditor.tsx`
- **Adicionar extensão `@tiptap/extension-tab-indentation` ou handler manual de Tab**: Configurar `handleKeyDown` no `editorProps` para capturar a tecla Tab e inserir indentação (4 espaços ou `\t`), e Shift+Tab para remover indentação
- Isso permite tabulação dentro do corpo do email sem perder o foco do editor

## Detalhes técnicos
- Para tabulação, usar abordagem manual no `editorProps.handleKeyDown` — mais simples que instalar extensão extra:
```tsx
handleKeyDown(view, event) {
  if (event.key === 'Tab') {
    event.preventDefault();
    if (event.shiftKey) {
      // opcional: outdent
    } else {
      editor.commands.insertContent('\t');
    }
    return true;
  }
  return false;
}
```
- Preview já é real-time via `form.corpo_texto` que atualiza no `onChange` do editor — o fix de cor resolverá a visibilidade

