

# Ajustar SEO da Landing Page

## Problemas atuais

1. **`lang="en"`** no `index.html` — o conteúdo é em português, Google interpreta como inglês
2. **Title genérico** — "Orbit CRM" sem palavras-chave de busca
3. **Meta description fraca** — "Sistema de Gestao de CRM com IA avançada" (sem acento, sem keywords ricas)
4. **Sem `og:url`** nem `og:locale`
5. **OG image usando favicon.png** — imagem muito pequena, sem impacto visual no compartilhamento
6. **Sem sitemap.xml** — Google não consegue descobrir páginas
7. **robots.txt sem Sitemap reference**
8. **Sem canonical URL**
9. **Sem structured data (JSON-LD)** — sem rich snippets no Google
10. **SPA sem meta tags dinâmicas** — todas as rotas mostram o mesmo title/description

## Implementação

### 1. `index.html` — Meta tags otimizadas

- `lang="pt-BR"`
- Title: `Orbit CRM — CRM com IA para WhatsApp, Email e Vendas`
- Description rica com keywords: CRM, WhatsApp, IA, funil de vendas, qualificação de leads, automação comercial
- `og:url`, `og:locale="pt_BR"`, `og:site_name`
- Canonical link
- JSON-LD `SoftwareApplication` structured data com nome, descrição, preços e avaliação

### 2. `public/sitemap.xml` — Criar

Listar rotas públicas: `/`, `/trial`, `/doc`, `/auth`

### 3. `public/robots.txt` — Adicionar referência ao sitemap

```
Sitemap: https://orbiitcrm.lovable.app/sitemap.xml
```

### 4. `LandingPage.tsx` — Title dinâmico

Usar `document.title` via `useEffect` para definir title específico da landing ao montar.

### 5. `TrialPage.tsx` e `AuthPage.tsx` — Titles específicos

Cada página pública define seu próprio `document.title` com keywords relevantes.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `index.html` | Reescrever meta tags SEO + JSON-LD |
| `public/sitemap.xml` | **Criar** |
| `public/robots.txt` | Adicionar Sitemap |
| `src/pages/LandingPage.tsx` | `useEffect` para `document.title` |
| `src/pages/TrialPage.tsx` | `useEffect` para `document.title` |
| `src/pages/AuthPage.tsx` | `useEffect` para `document.title` |

