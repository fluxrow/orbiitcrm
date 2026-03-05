

# Refatorar Prospects Page em Lead Action Hub

## Escopo

Transformar a tela de Prospects em um hub de ações com cards interativos, timeline unificada, ações rápidas e seleção em massa.

## 1. Criar tabela `prospect_events` (Migration)

```sql
CREATE TABLE public.prospect_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  prospect_id uuid NOT NULL REFERENCES orbit_prospects(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL, -- lead_created, conversation_started, email_sent, campaign_sent, pipeline_added, note_added, status_changed
  titulo text,
  descricao text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prospect_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_prospect_events_prospect ON prospect_events(prospect_id, created_at DESC);

-- RLS
CREATE POLICY "Users can view own empresa events" ON prospect_events FOR SELECT USING (empresa_id = get_user_empresa_id(auth.uid()));
CREATE POLICY "PE members can insert own empresa events" ON prospect_events FOR INSERT WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));
CREATE POLICY "Super admin full access prospect_events" ON prospect_events FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
```

## 2. Novo hook `useProspectEvents`

**Arquivo**: `src/hooks/useProspectEvents.ts`

- `useProspectEvents(prospectId)` - lista eventos do prospect ordenados por data
- `useCreateProspectEvent()` - mutation para inserir evento

## 3. Novo componente `ProspectActionCard`

**Arquivo**: `src/components/orbit/ProspectActionCard.tsx`

Card interativo com:
- **Topo**: Nome, empresa (nome_fantasia), badge de status com cores
- **Info**: Telefone, email, origem, data criacao (formatada com date-fns)
- **Indicadores**: icones para sem-telefone, sem-email, convertido, lead quente (score > 70)
- **Barra de acoes rapidas**: Iniciar conversa (WhatsApp), Enviar email, Adicionar nota, Criar tarefa, Enviar para funil
- **Checkbox** de selecao em massa (canto superior esquerdo)
- **Botao "Ver historico"** que abre sheet lateral

## 4. Novo componente `ProspectTimeline`

**Arquivo**: `src/components/orbit/ProspectTimeline.tsx`

Sheet lateral (usando `Sheet` do shadcn) com:
- Timeline vertical dos `prospect_events`
- Icones por tipo de evento
- Data formatada
- Descricao do evento

## 5. Novo componente `AddToFunnelDialog`

**Arquivo**: `src/components/orbit/AddToFunnelDialog.tsx`

Dialog para selecionar funil/etapa:
- Usa `useFunilEtapas()` para listar etapas
- Chama `usePromoteProspect()` para converter
- Registra evento `pipeline_added` no prospect_events

## 6. Novo componente `AddNoteDialog`

**Arquivo**: `src/components/orbit/AddNoteDialog.tsx`

Dialog simples com textarea para nota. Registra evento `note_added`.

## 7. Refatorar `ProspectsPage.tsx`

- **Barra superior**: campo de busca grande, filtros (status, segmento, origem, cidade, estado), ordenacao (recentes, antigos, nome)
- **Grid de ProspectActionCards**
- **Barra inferior fixa** (aparece quando ha selecao): contador + botoes de acao em massa (Enviar campanha, Adicionar ao funil, Adicionar tag, Excluir)
- Paginacao client-side (50 por pagina)
- Manter ProspectDialog existente para criar/editar

## 8. Auto-registro de evento `lead_created`

No `useCreateProspect`, apos criar o prospect, inserir automaticamente um evento `lead_created` no `prospect_events`.

## Arquivos criados/editados

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar tabela `prospect_events` |
| `src/hooks/useProspectEvents.ts` | Novo |
| `src/components/orbit/ProspectActionCard.tsx` | Novo |
| `src/components/orbit/ProspectTimeline.tsx` | Novo |
| `src/components/orbit/AddToFunnelDialog.tsx` | Novo |
| `src/components/orbit/AddNoteDialog.tsx` | Novo |
| `src/pages/orbit/ProspectsPage.tsx` | Refatorar |
| `src/hooks/useOrbitProspects.ts` | Adicionar auto-evento no create |

