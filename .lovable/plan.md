

# Adicionar "Enviar Email de Teste" no Step 2 do Campaign Wizard

## Objetivo

Após o usuário selecionar um template no passo 2 do wizard, exibir um botão "Enviar Email de Teste" que abre um dialog para enviar o template selecionado a um email de teste, com substituição de variáveis e preview — conforme os prints de referência.

## Alterações

| Arquivo | Alteração |
|---|---|
| `src/components/orbit/CampaignWizard.tsx` | Adicionar botão "Enviar Email de Teste" visível quando `template_id` está selecionado. Adicionar dialog inline com: campo email destino, extração automática de variáveis `{nome}`, `{empresa}` etc. do `corpo_texto` do template, campos editáveis para cada variável, aba de preview com substituição em tempo real, e botão de envio que chama `orbit-send-email` |

### Detalhes técnicos

**1. Botão "Enviar Email de Teste"**
- Aparece abaixo da lista de templates, somente quando `data.template_id` está preenchido
- Ícone de `Mail` + texto "Enviar Email de Teste"
- Abre estado `showTestEmail` com um painel inline (mesmo padrão do AI gen)

**2. Painel de teste inline**
- Campo "Email de Destino" (obrigatório)
- Extração de variáveis via regex `/{(\w+)}/g` do `corpo_texto` do template selecionado
- Valores padrão sugeridos: `{nome}` → "João Teste", `{empresa}` → "Empresa Exemplo", `{cidade}` → "São Paulo", `{link}` → "https://exemplo.com", `{responsavel}` → "Maria Responsável", `{segmento}` → "Tecnologia"
- Tabs "Dados de Teste" e "Preview":
  - Dados de Teste: grid 2 colunas com inputs para cada variável
  - Preview: renderiza o `corpo_texto` com variáveis substituídas pelos valores preenchidos

**3. Envio do teste**
- Monta `html` a partir do `corpo_texto` substituído (converte `\n` em `<br>`)
- Usa `assunto_email` do template selecionado (com variáveis substituídas)
- Chama `supabase.functions.invoke("orbit-send-email", { body: { to, subject, html, empresa_id } })`
- Busca `empresa_id` do profile (mesmo padrão já existente no wizard)
- Trata resposta com envelope pattern (`data.ok`)
- Toast de sucesso/erro

**4. Sem alteração na edge function** — `orbit-send-email` já suporta envio avulso com `to`, `subject`, `html` e `empresa_id`.

