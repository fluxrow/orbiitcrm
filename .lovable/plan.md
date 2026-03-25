

# Preservar formatação de templates e adicionar negrito/itálico para email

## Problema
1. Templates salvos perdem quebras de linha e tabulações ao serem exibidos (renderizados como texto inline sem `whitespace-pre-wrap`)
2. Para email, não há opção de aplicar **negrito** ou *itálico*

## Solução

### 1. Exibição de templates — preservar whitespace
Adicionar `whitespace-pre-wrap` em todos os locais que renderizam `corpo_texto`:

- **`TemplatesPage.tsx`** (linha ~242): card de listagem — adicionar `whitespace-pre-wrap` ao `<p>` que exibe o texto
- **`CampaignReviewDialog.tsx`** (linha ~90): já tem `whitespace-pre-wrap` — OK
- **`CampaignWizard.tsx`**: verificar preview do template no wizard e garantir `whitespace-pre-wrap`

### 2. Conversão `\n` → `<br>` no envio
- **`CampaignWizard.tsx`** (linha 324): já faz `.replace(/\n/g, "<br>")` — OK
- **`send-orbit-campaign/index.ts`** (linha 330): quando usa `mensagem` como fallback (`<p>${mensagem}</p>`), precisa converter `\n` para `<br>` para preservar quebras de linha

### 3. Editor rich-text para email — negrito e itálico
Substituir o `<Textarea>` do corpo do template por um editor simples com toolbar quando `canal === "email"`:

- **`TemplatesPage.tsx`**: para o campo "Corpo do Template", quando `isEmail`:
  - Adicionar toolbar com botões Bold (B), Italic (I) usando `contentEditable` div
  - Usar um `div[contentEditable]` com suporte a `document.execCommand('bold')` e `document.execCommand('italic')`
  - Salvar o HTML resultante em `corpo_texto` (o campo já aceita texto, e no envio de email é convertido para HTML)
  - Para WhatsApp, manter o `<Textarea>` simples (WhatsApp usa `*bold*` e `_italic_` em texto puro)

- **`CampaignWizard.tsx`**: mesmo tratamento no inline template creator do wizard

### 4. Renderização do HTML no envio de campanhas
- **`send-orbit-campaign/index.ts`**: quando canal é email, o `corpo_texto` já pode conter tags HTML (`<b>`, `<i>`). Na linha 330, usar `html || mensagem` (sem wrapping em `<p>`) para que as tags sejam preservadas. Converter `\n` para `<br>` no fallback texto.

## Arquivos modificados
1. `src/pages/orbit/TemplatesPage.tsx` — whitespace-pre-wrap na listagem + editor rich-text para email
2. `src/components/orbit/CampaignWizard.tsx` — whitespace-pre-wrap no preview + editor rich-text no inline creator
3. `supabase/functions/send-orbit-campaign/index.ts` — converter `\n` → `<br>` no fallback de mensagem

