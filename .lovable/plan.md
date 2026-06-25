
# Plano Atualizado — Hotfixes Etapa 2.5 + Testes E2E

Antes de abrir a Etapa 3, fechamos dois bugs reportados em uso real e blindamos as ações rápidas do `ProspectActionCard` com testes de integração. Tudo entregue em commits pequenos e isolados.

---

## H1 — Scroll horizontal sequestrado no trackpad do Mac

**Sintoma:** dois dedos no Kanban dispara o "voltar/avançar" do histórico do navegador.

**Causa:** o container do board não isola o overscroll horizontal — o gesto vaza para a navegação nativa.

**Correção (CSS only):**
- `src/pages/orbit/FunilPage.tsx`: na div do board (`flex gap-4 overflow-x-auto pb-4`) adicionar `overscroll-x-contain` (Tailwind) **e** `style={{ overscrollBehaviorX: "contain" }}` como fallback para garantir suporte cross-browser.
- Aplicar a mesma proteção em `src/pages/pe-admin/OportunidadesKanbanPage.tsx` (mesmo padrão de Kanban, mesma vulnerabilidade).
- Smoke manual: scrollar até o limite direito/esquerdo no Mac e confirmar que a página não navega.

---

## H2 — Lead criado manualmente não aparece no Funil

**Sintoma:** ao cadastrar um prospect "qualificado" pela UI, ele entra em `orbit_prospects` mas o card não aparece no Kanban.

**Diagnóstico em duas frentes:**

### H2.a — Garantir criação do Deal na mutação manual
- Auditar `useOrbitProspects` (e qualquer dialog que cria prospect) e o fluxo de promoção.
- Sempre que `status_qualificacao === 'qualificado'` for setado/criado pela UI, chamar `ensure_deal_for_prospect` (RPC já existente) na mesma mutação, dentro de `onSuccess`, antes do invalidate.
- Invalidar queries: `["orbit-deals-grouped"]`, `["orbit-prospects"]`.

### H2.b — Realtime no Kanban
- `FunilPage.tsx` hoje depende apenas de invalidate manual. Adicionar um `useEffect` com `supabase.channel('funil-deals')` escutando `postgres_changes` em `orbit_deals` filtrado por `empresa_id`, invalidando `orbit-deals-grouped` em insert/update/delete.
- Cleanup com `removeChannel` no unmount (regra de ouro Realtime — sem leak).
- Confirmar que `orbit_deals` já está na publicação `supabase_realtime`; se não, migration de 1 linha:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_deals;
  ```

**Validação:** cadastrar prospect manual → card aparece sem F5 · mover etapa em outra aba → primeira aba atualiza.

---

## H3 — Testes de Integração das Ações Rápidas

Adaptar o script Playwright enviado para a stack real (sem rotas `/api/test/*` que não existem — usamos Supabase direto com a sessão do dev).

**Estrutura:**
- `tests/e2e/prospect-quick-actions.spec.ts` (novo) — Playwright dirigido por `code--exec` quando o usuário pedir validação ao vivo.
- Setup: `data-testid` consistentes em `ProspectQuickActions.tsx`:
  - `toggle-ai-action`
  - `move-stage-action`
  - `force-flow-action`
- Setup também em `DealCard` / coluna do Kanban: `data-column-id={etapa.slug ?? etapa.id}` e `data-prospect-id` no card, para os asserts visuais.
- Os asserts de banco usam o client Supabase diretamente (não rotas REST inventadas), reaproveitando o fluxo de auth Lovable.

**Cobertura dos 3 cenários (idêntica à proposta do usuário):**
1. Toggle IA → toast "IA pausada" + `orbit_conversas.human_talk === true`.
2. Mover etapa → toast "Etapa atualizada" + card visível na nova coluna do Kanban.
3. Forçar fluxo → toast "Fluxo forçado" + linha em `orbit_flow_events` com `event_type='manual_trigger'` e `payload.forced_flow_id` correto.

Os testes ficam opt-in (não rodam no CI padrão de unit) — chamados via `bunx playwright test` sob demanda.

---

## H4 — Atualização dos `data-testid` no componente

Pequeno PR só para anotar selectors estáveis em `ProspectQuickActions.tsx` e `DealCard.tsx`. Zero mudança de comportamento, habilita os testes.

---

## Ordem de execução (commits pequenos)

```text
1. H1  CSS overscroll Kanban (Funil + Oportunidades)         [2 min]
2. H2a Mutação manual chama ensure_deal_for_prospect          [10 min]
2. H2b Realtime channel em FunilPage + migration publication  [10 min]
3. H4  data-testid em QuickActions + DealCard                 [5 min]
4. H3  Spec Playwright tests/e2e/prospect-quick-actions       [20 min]
5.     Atualizar .lovable/plan.md marcando Etapa 2.5 fechada
6. →   Liberar Etapa 3 F1 (Webhook Receiver)
```

## Detalhes técnicos

- **Realtime:** canal único por página, com cleanup em `useEffect` (evita o "billing loop" documentado nas guidelines).
- **Mutação manual:** chamada à RPC só dispara se `etapa_id` ainda não existir — `ensure_deal_for_prospect` é idempotente, então é seguro chamar sempre.
- **Playwright:** rodado via `code--exec` em `headless=True`, viewport `1280x1800`, restaurando a sessão Supabase via `LOVABLE_BROWSER_SUPABASE_*` (workflow padrão do sandbox).
- **Identidade visual:** sem mudanças — apenas CSS funcional (`overscroll-behavior`) e selectors.

## Fora deste plano

- Etapa 3 (Webhook, CSV, Anti No-Show, Observabilidade) — começa **depois** que H1–H4 estiverem verdes.
- Refatorar `ProspectActionCard` (já está estável).
