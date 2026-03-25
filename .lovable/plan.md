

# Editor de Template de Email — Página Dedicada

## Resumo
Substituir o dialog/modal de criação e edição de templates de email por uma página dedicada com editor rich-text completo, preview em tempo real e layout profissional. Templates de WhatsApp continuam usando o dialog existente.

## Arquivos a criar

### 1. `src/components/orbit/EmailTemplateEditor.tsx`
Componente principal do editor rich-text usando TipTap (biblioteca leve baseada em ProseMirror, instalada via `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-heading`, `@tiptap/extension-placeholder`).

Inclui:
- **Toolbar fixa** com botoes de: negrito, italico, sublinhado, headings (H1-H3), alinhamento (esquerda/centro/direita), listas (ordenada/nao-ordenada), cor do texto, inserir link, inserir imagem, desfazer/refazer
- **Botoes de variáveis** — clicáveis para inserir `{{nome}}`, `{{empresa}}`, etc. na posicao do cursor
- **Area de edição** estilizada como corpo de email (fundo branco, max-width centralizado, padding generoso)
- Props: `content`, `onChange`, `className`

### 2. `src/pages/orbit/EmailTemplateEditorPage.tsx`
Página dedicada full-page com layout:

```text
┌─────────────────────────────────────────────────────┐
│ ← Voltar   Templates > Novo template de email       │
│                                    [Salvar] [Salvar e voltar] │
├────────────────────────┬────────────────────────────┤
│  EDITOR (60%)          │  PREVIEW (40%)             │
│                        │                            │
│  Nome: [________]      │  ┌──────────────────────┐  │
│  Categoria: [___]      │  │  Preview do email    │  │
│  Assunto: [________]   │  │  com formatação      │  │
│  Imagem: [upload/url]  │  │  e assinatura        │  │
│                        │  │                      │  │
│  ┌──toolbar──────────┐ │  │                      │  │
│  │ B I U H1 H2 • ≡  │ │  │                      │  │
│  ├───────────────────┤ │  │                      │  │
│  │                   │ │  │  ── assinatura ──    │  │
│  │  editor area      │ │  └──────────────────────┘  │
│  │                   │ │                            │
│  └───────────────────┘ │  Variáveis disponíveis:    │
│                        │  {{nome}} {{empresa}} ...   │
│  Vars: [nome][empresa] │                            │
│  ⓘ Assinatura será     │                            │
│    aplicada no envio   │                            │
└────────────────────────┴────────────────────────────┘
```

- **Lado esquerdo**: campos de metadados (nome, categoria, assunto, imagem) + editor TipTap + botoes de variáveis + nota sobre assinatura
- **Lado direito**: preview em tempo real renderizando o HTML do editor + placeholders destacados + simulação de assinatura no final
- **Topo**: breadcrumb (Templates > Novo/Editar), botao voltar, botoes Salvar e Salvar e Voltar
- **Unsaved changes guard**: ao tentar sair com alterações nao salvas, exibir confirmação
- **Mobile**: empilha editor acima do preview, toolbar acessível
- Usa `OrbitLayout` como wrapper
- Busca template por ID via `useOrbitTemplates` quando em modo edição (rota `:id/edit`)

## Arquivos a modificar

### 3. `src/App.tsx`
Adicionar rotas no `OrbitRoutes`:
```
templates/email/new → EmailTemplateEditorPage
templates/email/:id/edit → EmailTemplateEditorPage
```
Importar o novo componente de página.

### 4. `src/pages/orbit/TemplatesPage.tsx`
- Botao "Novo" na aba email: `navigate("email/new")` em vez de abrir dialog
- Botao editar no card de email: `navigate(`email/${t.id}/edit`)` em vez de abrir dialog
- Manter dialog apenas para WhatsApp
- Remover lógica de dialog de email (contentEditable, toolbar B/I) que foi movida para a página dedicada
- Dialog de geração por IA: quando canal é email, ao clicar "Editar e Salvar", navegar para a página de edição passando os dados via state do navigate

## Dependências a instalar
- `@tiptap/react`
- `@tiptap/starter-kit` (inclui bold, italic, heading, lists, history/undo-redo, etc.)
- `@tiptap/extension-underline`
- `@tiptap/extension-text-align`
- `@tiptap/extension-link`
- `@tiptap/extension-image`
- `@tiptap/extension-color`
- `@tiptap/extension-text-style`
- `@tiptap/extension-placeholder`

## Detalhes técnicos
- TipTap é a escolha ideal: leve, extensível, React-native, substitui o `contentEditable` + `execCommand` atual
- O editor produz HTML que é armazenado no campo `corpo_texto` existente — sem mudança no banco
- Preview renderiza o HTML via `dangerouslySetInnerHTML` com estilos inline simulando email real
- Variáveis são inseridas como texto literal `{{nome}}` no conteúdo — nao quebram o HTML
- Guard de unsaved changes usa `window.onbeforeunload` + React Router blocker

