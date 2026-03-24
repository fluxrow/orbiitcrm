

# Validar variáveis antes de salvar template

## Problema
O usuário pode digitar variáveis inválidas (ex: `{{nme}}`, `{{emprsa}}`) no corpo do template. Essas tags são enviadas literalmente na mensagem porque não existem no mapa de substituição.

## Solução
Antes de salvar, extrair todas as tags `{{...}}` do `corpo_texto` (e `assunto_email` se email) e validar contra a lista de variáveis suportadas.

### Variáveis permitidas
`{{nome}}`, `{{empresa}}`, `{{nome_fantasia}}`, `{{email}}`, `{{telefone}}`, `{{cidade}}`, `{{segmento}}`

### Alteração em `src/pages/orbit/TemplatesPage.tsx`

1. Criar constante com as variáveis válidas
2. No `handleSave`, antes de salvar:
   - Extrair todas as ocorrências de `{{...}}` via regex
   - Comparar com a lista permitida
   - Se houver inválidas, exibir toast de erro listando quais são inválidas e não salvar
3. Atualizar o hint de variáveis no formulário para listar todas as disponíveis

### Arquivo modificado
- `src/pages/orbit/TemplatesPage.tsx` — ~15 linhas adicionadas

