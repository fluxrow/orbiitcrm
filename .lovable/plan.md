

# Substituir ícone de foguete pela logo na tela de login

## Alteração

### `src/pages/AuthPage.tsx`

- Remover o ícone `Rocket` do lucide-react
- Importar `orbitLogo` de `@/assets/orbit-logo.png`
- Substituir o bloco do ícone (div com gradient + Rocket) por uma tag `<img>` exibindo a logo, similar ao padrão usado no `TenantLayout` e `OrbitSidebar`
- Manter o texto "ORBIT CRM" e "Prospecção B2B" ao lado da logo

