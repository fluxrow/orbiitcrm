

# Substituir ícone de foguete pela logo na tela de login

## Alteração

No arquivo `src/pages/AuthPage.tsx`:

1. Remover import do ícone `Rocket` do lucide-react
2. Adicionar import da imagem `orbit-logo.png`
3. Substituir o bloco do ícone (div com gradiente + Rocket) por uma tag `<img>` exibindo a logo com tamanho adequado (ex: `h-14`)
4. Remover o texto "ORBIT CRM" e subtítulo redundantes, já que a logo contém o branding — ou mantê-los se desejado

### Arquivo editado
- `src/pages/AuthPage.tsx`

