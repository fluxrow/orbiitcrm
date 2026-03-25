

# Melhorar layout do editor de email para prévia mais realista

## Problema
O dialog de edição de template é estreito (`sm:max-w-lg` = 512px), fazendo o editor de corpo parecer uma coluna fina. O usuário quer um aspecto mais retangular/largo para simular como a mensagem será vista pelo destinatário.

## Solução

### `src/pages/orbit/TemplatesPage.tsx`

1. **Ampliar o dialog** quando for email: trocar `sm:max-w-lg` por `sm:max-w-2xl` (672px) para dar mais largura ao editor
2. **Estilizar o contentEditable** como um "email preview": adicionar fundo branco, padding maior, max-width centralizado simulando um corpo de email (ex: `max-w-[560px] mx-auto bg-white text-black`), com min-height maior (~250px)
3. **Manter WhatsApp inalterado**: a largura expandida e estilo de preview só se aplicam quando `isEmail` é true

### Mudanças específicas
- Linha 268: dialog className dinâmico — `sm:max-w-2xl` quando email, `sm:max-w-lg` quando WhatsApp
- Linha 353-358: contentEditable div — adicionar `bg-white text-foreground min-h-[250px] max-w-[560px] mx-auto p-6` para simular um email real

