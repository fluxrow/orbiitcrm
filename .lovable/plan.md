

# Etapa 3F -- Tarefas (Minhas + Hoje/Atrasadas/Proximas)

Evoluir `/pe-admin/tarefas` de uma tabela simples para uma visao operacional agrupada por urgencia, com filtro "Minhas tarefas" e acoes rapidas inline.

---

## Abordagem

Nenhuma alteracao de banco necessaria. O hook `useTarefas` ja suporta `assigned_to_user_id` como filtro, e `useUpdateTarefa` ja aceita `due_date` e `prioridade`. Todo o trabalho e no frontend.

Buscaremos tarefas abertas (sem filtro de status) e agruparemos client-side em 4 secoes temporais. Tarefas concluidas ficam em secao colapsavel no final.

---

## Fase 1 -- Filtro "Minhas Tarefas"

### Arquivo: `src/pages/pe-admin/TarefasPage.tsx`

- Importar `usePeAuth` para obter `peUser`, `roleCode`, `isSuperAdmin`
- Adicionar estado `minhasTarefas` (boolean, default `true` para Sales/SDR, `false` para Admin/Manager/SuperAdmin)
- Usar `Switch` + label "Minhas tarefas" no header de filtros
- Passar `assigned_to_user_id: minhasTarefas ? peUser.id : undefined` ao `useTarefas`
- Remover filtro de status fixo -- buscar todas (open + done) e agrupar client-side

---

## Fase 2 -- Agrupamento Temporal

Apos receber `tarefas`, separar client-side em 4 grupos usando `date-fns`:

```text
const hoje = startOfDay(new Date())

Atrasadas:  status='open' AND due_date < hoje
Hoje:       status='open' AND due_date = hoje
Proximas:   status='open' AND (due_date > hoje OR due_date is null)
Concluidas: status='done'
```

Renderizar cada grupo como secao com:
- Header com titulo + contagem (badge)
- Secao "Atrasadas" com destaque visual (borda vermelha / texto destructive)
- Secao "Concluidas" colapsavel (Collapsible) e fechada por default

---

## Fase 3 -- Card de Tarefa (substituir tabela)

Trocar a tabela por cards para melhor usabilidade. Cada card:

```text
+-----------------------------------------------+
| [checkbox] Titulo              [high] badge    |
|   Cliente > Oportunidade                       |
|   Vence: 20/02  |  Responsavel: Joao           |
|   [Reagendar]                                  |
+-----------------------------------------------+
```

- Checkbox: marca como done (ja existe)
- Badge de prioridade com cores existentes
- Linha de contexto: cliente + oportunidade
- Due date formatada com `format(parseISO(...), "dd/MM")`
- Botao "Reagendar": abre Popover com Calendar (date picker inline)

---

## Fase 4 -- Acoes Rapidas

### Reagendar (due_date)

- Botao icone calendario no card
- Abre `Popover` com `Calendar` (mode="single")
- Ao selecionar data, chama `useUpdateTarefa.mutate({ id, due_date: format(date, "yyyy-MM-dd") })`
- Popover fecha automaticamente

### Alterar Prioridade (opcional inline)

- Click na badge de prioridade abre `Popover` com 3 opcoes (low/normal/high)
- Ao selecionar, chama `useUpdateTarefa.mutate({ id, prioridade })`

---

## Fase 5 -- Filtros Complementares

Manter filtro de prioridade existente. Remover filtro de status (agora e agrupamento visual).

---

## Resumo de Arquivos

| Arquivo | Acao |
|---|---|
| `src/pages/pe-admin/TarefasPage.tsx` | **Reescrever** -- layout card-based, agrupamento temporal, filtro "minhas", acoes inline |

Nenhum arquivo novo, nenhuma alteracao de banco. Apenas refatoracao da pagina existente.

