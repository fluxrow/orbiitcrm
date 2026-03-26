

# Filtro por Canal na Tela de Campanhas

## O que já existe
- Campo `canal` já existe em `orbit_campaigns` (valores: `email`, `whatsapp`)
- Cards já mostram ícone diferenciado por canal (linhas 250-255)
- Hook `useOrbitCampaigns` já suporta filtro `canal` (linhas 22-24 do hook)
- Nenhuma mudança de banco necessária

## Alterações — apenas `src/pages/orbit/CampanhasPage.tsx`

### 1. Adicionar state e Select para filtro de canal
- Novo state `canalFilter` (default `"all"`)
- Passar para o hook: `useOrbitCampaigns({ status: statusFilter, canal: canalFilter })`
- Adicionar Select ao lado do filtro de status existente com opções: Todos os Canais, Email, WhatsApp

### 2. Adicionar badge de canal no card
- Ao lado do ícone existente, adicionar label textual: "Email" ou "WhatsApp"
- Pequeno badge/texto para reforçar leitura rápida

### 3. Métricas contextuais por canal
- Email: Destinatários, Enviados, Aberturas, Cliques, Respostas
- WhatsApp: Destinatários, Enviados, Entregues, Lidos, Respostas
- Condicional no `canal` da campanha para escolher quais métricas exibir

### 4. Analytics para WhatsApp
- Linha 378: remover restrição `campaignCanal === "email"` do `canAnalytics`, permitindo analytics para ambos os canais

| Arquivo | Ação |
|---------|------|
| `src/pages/orbit/CampanhasPage.tsx` | Filtro de canal + badge + métricas contextuais |

