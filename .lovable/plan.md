Remover o botão "Ver apresentação completa" do hero da Landing Page.

## Alteração
- `src/pages/LandingPage.tsx` (linhas 172-177): remover o `<a href="/apresentacao/orbit-2026">Ver apresentação completa</a>` dentro do bloco de CTAs do hero, mantendo apenas o CTA "Quero minha agenda cheia".

Nenhuma outra área é alterada. A rota `/apresentacao/orbit-2026` continua acessível diretamente.