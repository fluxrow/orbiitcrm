# OrbiitCRM

CRM multi-tenant com WhatsApp, campanhas e IA para vendas.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + shadcn/ui + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Edge Functions + Storage + Auth)
- **WhatsApp:** Z-API
- **Deploy:** Lovable (gerenciado)

## Funcionalidades principais

- Gestão de conversas WhatsApp por empresa
- Agente IA com respostas automáticas e biblioteca de áudios
- Campanhas em massa com segmentação
- Busca e importação de leads (Apollo)
- Multi-tenant com isolamento por `empresa_id` + RLS
