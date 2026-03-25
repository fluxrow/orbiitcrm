

# Fix: Botoes negrito/italico nao funcionam no editor de email

## Problema
Os botoes Bold e Italic usam `document.execCommand("bold")` que so funciona quando ha texto selecionado dentro do `contentEditable` div. Quando o usuario clica no botao, o foco sai do editor (vai para o botao), perdendo a selecao de texto -- por isso o comando nao tem efeito.

## Solucao

### `src/pages/orbit/TemplatesPage.tsx`

1. Adicionar um `useRef` para o div `contentEditable`
2. Nos botoes Bold e Italic, usar `onMouseDown` com `e.preventDefault()` em vez de `onClick` -- isso impede que o botao roube o foco do editor, mantendo a selecao de texto ativa
3. Executar `document.execCommand` no handler do `onMouseDown`

Mudanca nos botoes (linhas 334-351):
```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  className="h-7 w-7 p-0 font-bold"
  onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }}
>
  B
</Button>
<Button
  type="button"
  variant="outline"
  size="sm"
  className="h-7 w-7 p-0 italic"
  onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }}
>
  I
</Button>
```

## Arquivos modificados
- `src/pages/orbit/TemplatesPage.tsx` -- trocar `onClick` por `onMouseDown` com `preventDefault` nos botoes de formatacao

