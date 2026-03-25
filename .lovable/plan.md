

# Reestruturação da Landing Page — Página de vendas completa

## Resumo
Reescrever a `LandingPage.tsx` como uma página de vendas persuasiva e orientada a conversão, com copy comercial forte, novas seções (Problema, Solução, Diferenciais, Para quem é, Prova de valor) e conteúdo focado 100% no que já está implementado.

## Estrutura final da página (seções em ordem)

### 1. Hero
- **Headline**: "Sua equipe comercial no piloto automático"
- **Subheadline**: "O Orbit é o CRM com IA que atende, qualifica e distribui leads pelo WhatsApp, email e redes sociais — para que seu time só feche negócios."
- CTAs: "Testar grátis por 7 dias" + "Ver demonstração"
- Badges de prova: "WhatsApp + IA", "CRM completo", "Campanhas automáticas"

### 2. Problema (nova seção)
- 3 cards com dores reais:
  - "Leads perdidos no WhatsApp pessoal" — vendedores usam celular próprio, empresa perde histórico
  - "Equipe sem processo" — sem funil, sem follow-up, oportunidades esquecidas
  - "Tempo gasto com leads frios" — vendedores perdem horas respondendo quem não vai comprar

### 3. Solução (nova seção)
- Texto direto: "O Orbit centraliza toda a operação comercial em uma plataforma com IA que trabalha 24h"
- 3 pontos-chave com ícones: "IA qualifica antes do vendedor", "Tudo registrado automaticamente", "Distribuição inteligente entre a equipe"

### 4. Como funciona (5 passos — fluxo real)
- Passo 1: Lead entra (WhatsApp, importação, busca ativa, formulário)
- Passo 2: IA atende e qualifica automaticamente
- Passo 3: Lead qualificado é encaminhado ao vendedor certo (handoff)
- Passo 4: Vendedor negocia no funil Kanban com tarefas e timeline
- Passo 5: Campanhas de follow-up por email e WhatsApp

### 5. Funcionalidades (reorganizadas em 3 colunas)
- **IA & Automação**: Atendimento IA no WhatsApp, qualificação automática, distribuição round-robin
- **CRM & Pipeline**: Funil Kanban, tarefas por oportunidade, timeline de interações, importação de contatos
- **Comunicação & Campanhas**: WhatsApp bidirecional, email marketing, templates editáveis, Instagram e Facebook (Plus)

### 6. Diferenciais (nova seção)
- "IA de verdade, não chatbot" — qualifica, extrai dados, encaminha com contexto
- "Anti-bloqueio WhatsApp" — warm-up, delays aleatórios, controle de volume
- "Multi-empresa" — cada empresa com ambiente isolado, dados separados
- "Tudo em um só lugar" — sem precisar de 5 ferramentas diferentes

### 7. Prova de valor (nova seção)
- 3 blocos com números/benefícios:
  - "Economia de horas" — IA responde 24h, vendedor foca no que importa
  - "Mais conversão" — leads qualificados chegam prontos ao vendedor
  - "Zero lead perdido" — tudo registrado, com histórico e follow-up

### 8. Para quem é (nova seção)
- Cards com perfis: Agências, Consultorias B2B, Imobiliárias, Escolas/Cursos, Clínicas, Equipes de vendas com WhatsApp

### 9. Planos (mantidos, com copy melhorado)
- Mesma estrutura de 4 cards (Demo, Basic, Professional, Plus)
- Textos mais comerciais nos ideais

### 10. FAQ (atualizado com copy mais persuasivo)

### 11. CTA final (nova seção)
- Headline: "Pronto para vender mais com menos esforço?"
- Botão grande: "Começar agora — 7 dias grátis"
- Texto: "Sem cartão de crédito. Cancele quando quiser."

### 12. Acesso rápido (mantido)
### 13. Footer (mantido)

## Arquivo modificado
- `src/pages/LandingPage.tsx` — reescrita completa do conteúdo e adição de novas seções

## Detalhes técnicos
- Mesmos componentes UI existentes (Card, Button, Badge, Accordion, Input)
- Mesmos ícones do Lucide (adicionando alguns novos: `BotMessageSquare`, `ShieldCheck`, `Timer`, `TrendingUp`, `Building2`, `HeartHandshake`)
- Nenhum componente novo necessário
- CSS existente (`glass-card`, `gradient-text`) reutilizado
- Sem mudança no header (`HotsiteHeader`) ou layout (`PublicLayout`)

