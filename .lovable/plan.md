

# Aplicar logo Orbit em todos os locais (favicon, aba, social)

## Problema atual

- O **favicon** (`public/favicon.ico`) ainda é o padrão Lovable
- As **meta tags OG/Twitter** apontam para uma imagem social no storage do Lovable
- O `twitter:site` referencia `@Lovable` em vez de Orbit
- A logo Orbit (`src/assets/orbit-logo.png`) já é usada na sidebar e header, mas não no favicon nem nas meta tags

## Alterações

| Arquivo | Alteração |
|---|---|
| `public/favicon.png` | Copiar `src/assets/orbit-logo.png` para `public/favicon.png` para uso como favicon |
| `index.html` | Atualizar `<link rel="icon">` para apontar para `/favicon.png`. Remover referências `@Lovable` do `twitter:site`. Atualizar `og:image` e `twitter:image` para usar a logo Orbit local (`/favicon.png`). |

### Detalhes

1. **Favicon**: Copiar `orbit-logo.png` para `public/favicon.png` e referenciar no `index.html` com `<link rel="icon" href="/favicon.png" type="image/png">`
2. **Meta tags sociais**: Substituir as URLs de imagem do storage externo por `/favicon.png` (caminho relativo)
3. **Twitter site**: Alterar de `@Lovable` para `@OrbitCRM` (ou remover)
4. **Author**: Alterar de `Lovable` para `Orbit CRM`

Os locais que já usam `orbit-logo.png` no código (HotsiteHeader, OrbitSidebar, LandingPage, TenantLayout) já estão corretos e não precisam de alteração.

