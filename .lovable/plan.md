

# Landing Page + Pagina /trial -- Plano de Implementacao

## Resumo

Criar a landing page publica em `/` (substituindo o redirect para `/auth`) e uma pagina `/trial` com formulario de solicitacao. Ambas publicas, sem autenticacao, usando o design system existente (dark theme, cores primary/accent, glass-card).

## Parte 1: Arquivos Novos

### 1.1 `src/pages/LandingPage.tsx`

Pagina unica com todas as secoes:

1. **Header fixo** -- Logo "Orbit", menu (scroll-to-section), botoes "Acessar Demo", "Comecar Trial", "Entrar"
2. **Hero** -- Titulo gradient, subtexto, 3 bullets com icones, CTAs primario/secundario
3. **Como funciona** -- 4 cards/timeline (Capte leads, IA qualifica, Funil, Campanhas)
4. **Recursos** -- Grid 8 cards com icones Lucide (CRM, Funil Kanban, Tarefas, Interacoes, Email, WhatsApp, Distribuicao, Relatorios). IG/FB e Busca de Leads marcados com badge "Plus"
5. **Planos** -- 4 cards comparativos (Demo, Basic, Professional, Plus) com precos placeholder (R$ XX/mes), listas de features, CTAs diferenciados
6. **Acesso rapido** -- Input para slug + botao "Acessar" que navega para `/{slug}/dashboard`
7. **FAQ** -- Accordion com 7 perguntas usando componente existente
8. **Footer** -- Marca, links placeholder, copyright

Componentes utilizados: Button, Card, Badge, Accordion, Input (todos ja existem).

### 1.2 `src/pages/TrialPage.tsx`

Pagina publica `/trial` com formulario:
- Campos: nome, empresa, email, telefone, plano desejado (select: basic/professional/plus)
- Botao "Solicitar Trial"
- Ao enviar: insere na tabela `trial_requests` e mostra mensagem de sucesso
- Validacao com zod (campos obrigatorios, email valido)

## Parte 2: Database Migration

### Tabela `trial_requests`

```sql
CREATE TABLE trial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  empresa text NOT NULL,
  email text NOT NULL,
  telefone text,
  plan_code text NOT NULL DEFAULT 'basic',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trial_requests ENABLE ROW LEVEL SECURITY;

-- Permitir insercao anonima (formulario publico)
CREATE POLICY "Anyone can insert trial requests"
  ON trial_requests FOR INSERT
  WITH CHECK (true);

-- Apenas super_admin pode ler
CREATE POLICY "Super admins can read trial requests"
  ON trial_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));
```

## Parte 3: Alteracao em `src/App.tsx`

Substituir a rota `"/"`:

```text
ANTES:  <Route path="/" element={<Navigate to="/auth" replace />} />
DEPOIS: <Route path="/" element={<LandingPage />} />
```

Adicionar rota `/trial`:

```text
<Route path="/trial" element={<TrialPage />} />
```

Ambas antes das rotas reservadas, publicas (sem ProtectedRoute).

## Parte 4: Detalhes de Design

- Dark theme existente (bg `222 47% 6%`, primary cyan `187 92% 50%`)
- `glass-card` e `gradient-text` ja definidos no CSS
- Secoes com `max-w-7xl mx-auto` para conteudo centralizado
- Cards de planos com destaque visual no "Professional" (borda primary, badge "Mais popular")
- Scroll suave para navegacao do header (scroll-to-section com IDs)
- Responsivo: grid 1 col mobile, 2-4 cols desktop

## Parte 5: Icones Lucide Utilizados

Users, Target, BarChart3, CheckCircle, Mail, MessageSquare, Kanban, Clock, ListChecks, Zap, Search, ArrowRight, Rocket, Shield, ChevronRight

## Resumo de Arquivos

| Tipo | Arquivo |
|---|---|
| Novo | `src/pages/LandingPage.tsx` |
| Novo | `src/pages/TrialPage.tsx` |
| Migration | `trial_requests` table + RLS |
| Edit | `src/App.tsx` (rota `/` e `/trial`) |

## Ordem de Execucao

1. Migration SQL (tabela trial_requests)
2. LandingPage.tsx
3. TrialPage.tsx
4. App.tsx (rotas)

