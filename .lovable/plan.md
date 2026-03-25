

# Listas com marcadores no editor de email

## Situacao atual

O editor TipTap ja inclui suporte a listas (StarterKit tem bulletList e orderedList) e os botoes ja estao na toolbar. O problema e que:
1. As listas nao tem estilos inline para compatibilidade com clientes de email
2. O preview pode nao renderizar os bullets corretamente com a classe `prose`

## Mudancas

### 1. `src/components/orbit/EmailTemplateEditor.tsx`
- Configurar as extensoes `BulletList` e `OrderedList` do StarterKit com `HTMLAttributes` que adicionam estilos inline automaticamente:
  - `<ul>`: `style="padding-left:20px; margin:10px 0; list-style-type:disc;"`
  - `<ol>`: `style="padding-left:20px; margin:10px 0; list-style-type:decimal;"`
  - `<li>`: `style="margin-bottom:6px;"`
- Isso garante que o HTML gerado pelo editor ja contenha estilos inline compatíveis com Gmail, Outlook e Apple Mail
- O StarterKit permite override de extensoes individuais via `configure`

### 2. `src/pages/orbit/EmailTemplateEditorPage.tsx`
- Adicionar estilos CSS inline na div do preview para garantir que `ul`, `ol` e `li` renderizem com bullets/numeros visiveis e espaçamento adequado
- Adicionar ao `previewHtml` um pos-processamento que injeta estilos inline nos tags `<ul>`, `<ol>` e `<li>` caso nao existam (para templates antigos sem estilos)

### 3. `supabase/functions/orbit-send-email/index.ts`
- Antes de enviar, pos-processar o `html` para garantir que `<ul>`, `<ol>` e `<li>` sem `style` recebam estilos inline padrão para compatibilidade com email
- Regex simples para adicionar estilos se ausentes

## Detalhes tecnicos

Para o StarterKit, a configuracao fica:
```tsx
StarterKit.configure({
  heading: { levels: [1, 2, 3] },
  bulletList: {
    HTMLAttributes: {
      style: "padding-left: 20px; margin: 10px 0; list-style-type: disc;",
    },
  },
  orderedList: {
    HTMLAttributes: {
      style: "padding-left: 20px; margin: 10px 0; list-style-type: decimal;",
    },
  },
  listItem: {
    HTMLAttributes: {
      style: "margin-bottom: 6px;",
    },
  },
})
```

Para o preview, adicionar estilos ao container:
```tsx
<div
  className="prose prose-sm max-w-none text-black [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5"
  dangerouslySetInnerHTML={{ __html: previewHtml }}
/>
```

