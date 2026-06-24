# Onboarding de Cliente — Implantação Orbit CRM

Recriar no Lovable o fluxo de onboarding que o Claude tinha feito local, **profissionalizando** para o padrão visual do Orbit (dark, glassmorphism) e adicionando **fluxo completo de implementação** até a call de kick-off.

---

## O que vai existir

### 1. Tela interna `/{slug}/onboarding`
Item novo na sidebar do Orbit ("Onboarding"). Lista todos os onboardings criados pelo usuário/empresa, com:
- Status: `rascunho` | `enviado` | `em_andamento` | `concluido` | `revisado`
- Cliente (nome fantasia), data de envio, % de preenchimento
- Botão **"Novo onboarding"** → gera token único + link público + dispara email (Resend) para o cliente + para `fbcfarias@icloud.com` com o link
- Botão **"Copiar link"**, **"Reenviar email"**, **"Ver respostas"**, **"Arquivar"**

### 2. Tela pública `/onboarding-cliente/:token` (sem login)
Wizard de 8 seções, com:
- Sidebar esquerda: progresso visual + navegação entre steps (igual ao do Claude, mas no tema Orbit dark)
- Centro: formulário da seção atual
- Direita: **brief ao vivo** (preview do que está sendo respondido)
- Auto-save no banco a cada blur (não só localStorage)
- Botões: **Salvar e continuar depois**, **Enviar respostas finais**, **Baixar PDF/JSON**

**Seções** (baseadas no HTML do Claude, profissionalizadas):
1. **Empresa** — razão social, CNPJ, nome fantasia, site, segmento, porte, responsável
2. **ICP & Posicionamento** — cliente ideal, ticket médio, ciclo de venda, dores, diferenciais
3. **Funil & Processo Comercial** — etapas atuais, gatilhos, critérios de qualificação, motivos de perda
4. **Equipe & Distribuição** — vendedores, regras de roteamento de leads, metas
5. **Integrações** — WhatsApp (Z-API), Email (Resend/Google), Calendário (Google), Meta Ads, fontes de lead
6. **IA & Automação** — tom de voz, scripts proibidos, regras de handoff humano, horário de atendimento
7. **Templates & Campanhas** — modelos de mensagem iniciais, sequências, CTAs padrão
8. **Aprovação & Go-Live** — responsável final, data desejada de virada, pendências, observações

### 3. Fluxo de implementação (NOVO — não tinha no Claude)
Após o cliente clicar em "Enviar respostas finais":
- Status muda para `enviado` → notificação automática por email para o time interno
- Tela interna mostra **checklist de implementação** (gerado a partir das respostas):
  - [ ] Conectar Z-API e validar número
  - [ ] Configurar Resend e domínio
  - [ ] Importar base inicial de leads
  - [ ] Configurar funil e etapas
  - [ ] Treinar IA com tom de voz
  - [ ] Cadastrar templates aprovados
  - [ ] **Agendar call de kick-off** (botão integra com o calendário Google já existente)
- Cada item tem checkbox + responsável + status

### 4. Emails (via Resend / Lovable Emails)
Três templates app-mail:
- **convite-onboarding** → para o cliente com o link + prazo sugerido
- **onboarding-recebido** → para `fbcfarias@icloud.com` quando cliente envia, com resumo + link interno
- **convite-kickoff** → para o cliente com link do Google Meet/Calendar da call

---

## Estrutura técnica (resumo para o dev)

### Banco
- `orbit_client_onboardings` (id, empresa_id, token público, status, dados JSONB, responses JSONB, sent_at, completed_at, created_by)
- RLS por `empresa_id` (interno) + função `get_onboarding_by_token` (pública, sem auth)
- GRANTs para `authenticated` + `service_role`

### Edge Functions
- `orbit-onboarding-create` — gera token + envia email convite
- `orbit-onboarding-public-get` — lê dados pelo token (sem JWT)
- `orbit-onboarding-public-save` — autosave parcial pelo token
- `orbit-onboarding-public-submit` — finaliza + dispara email para o time
- `orbit-onboarding-send-kickoff` — agenda call e envia convite

Todas seguem envelope `{ ok, data, error }` e CORS padrão.

### Frontend
- `src/pages/orbit/OnboardingPage.tsx` (interna, listagem + checklist)
- `src/pages/public/ClientOnboardingPage.tsx` (wizard público)
- `src/hooks/useOrbitOnboarding.ts`
- Rota pública `/onboarding-cliente/:token` em `App.tsx` (fora do `TenantLayout`)
- Rota interna em `OrbitRoutes` + item na sidebar

### Visual
Tema dark Orbit existente (`glass-card`, `gradient-primary`). Sem reaproveitar o CSS claro do Claude — só a **estrutura/perguntas**. Tipografia e tokens já definidos no projeto.

---

## Fora deste plano (você confirmou)
- Limpeza de rotas `/demo`, `/orbit/*`, `SetupPage` → plano separado depois
- Remover valores da LP e padronizar CTAs → plano separado depois

---

## Pré-requisitos que vou verificar antes de codar
1. Lovable Emails / Resend já configurado? (vou checar domínio)
2. Calendário Google já tem `create_event` funcionando (já confirmamos que sim no contexto anterior) ✅

Se Lovable Emails não estiver pronto, vou rodar o setup antes de seguir com os edge functions de email.
