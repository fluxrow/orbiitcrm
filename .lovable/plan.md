

# Melhorar página "Meu Plano" no Orbit

## Contexto

A página atual mostra apenas 3 cards básicos (plano, status, trial). Precisa exibir limites do plano, consumo do mês e um botão de contato/upgrade — tudo somente leitura, sem nenhum link para PE Admin.

## Alterações

### Arquivo: `src/pages/orbit/MeuPlanoPage.tsx` (reescrita)

A página será reestruturada em seções:

**1. Cabeçalho do plano** (card principal)
- Nome do plano (Basic/Professional/Plus/Demo)
- Nome da empresa
- Badge de status (Ativo/Trial/Suspenso/Expirado/Pendente)
- Se trial: data de expiração com contagem regressiva ("Expira em X dias")

**2. Limites e consumo** (grid de cards)
Cards com barra de progresso mostrando uso atual vs limite do plano:
- Usuários (max_users)
- Prospects (max_prospects)  
- E-mails/mês (email_monthly vs email_sent)
- WhatsApp/mês (whatsapp_monthly vs whatsapp_sent)
- Instagram/mês (ig_monthly vs ig_sent) — só se feature habilitada
- Facebook/mês (fb_monthly vs fb_sent) — só se feature habilitada
- Lead Finder/mês (lead_search_monthly vs lead_search_calls) — só se feature habilitada

Dados de consumo vêm do hook `useSaasUsage` com o período atual (`YYYY-MM`).

**3. Features habilitadas** (lista com check/x)
- WhatsApp, E-mail, Instagram, Facebook, Lead Finder, Agente IA
- Ícone verde (habilitado) ou cinza (não disponível)

**4. Botão de ação**
- "Solicitar Upgrade" ou "Falar com Suporte"
- Abre link `mailto:` ou WhatsApp para contato (sem nenhum redirecionamento para PE Admin)
- Para planos demo: "Solicitar Acesso" apontando para página de trial

### Dados necessários (hooks existentes)

| Dado | Fonte |
|---|---|
| Plano + features + limits | `useSaasEmpresa` (já traz `saas_plans` via join) |
| Consumo mensal | `useSaasUsage(empresaId, period)` — hook já existe |
| Status/trial | `useTenant()` — já disponível |

Nenhuma tabela nova, nenhuma migração, nenhum hook novo. Apenas reescrever o componente da página.

### Detalhes técnicos

- O período atual será calculado com `format(new Date(), 'yyyy-MM')`
- Barras de progresso usam o componente `Progress` existente (`@/components/ui/progress`)
- Cards de canais desabilitados (feature = false) ficam com visual esmaecido e label "Não incluso"
- Quando consumo > 80% do limite, barra fica amarela; > 95% fica vermelha
- Zero referências a rotas `/pe-admin/*`

