## Problema

Hoje a aba **Configurações → Agenda** mistura duas coisas que não combinam:

1. **Configuração técnica** (conectar conta Google, escolher calendário/fuso, desconectar) — pertence a Config.
2. **Visualização da agenda** (próximos eventos, agendamentos feitos pela IA) — não pertence a Config. O usuário precisa ver isso no dia a dia, junto com tarefas.

E na aba **Tarefas** o calendário mostra só `due_date` das tarefas internas, sem nenhum evento do Google. Ou seja, o vendedor abre o CRM e não vê a agenda dele.

## Solução — reorganizar em duas frentes

### 1. Aba Tarefas vira o "centro de agenda"

Renomear a sub-aba **"Calendário"** para **"Agenda"** e transformá-la num calendário unificado que mostra:

- 🟦 **Tarefas internas do Orbit** (o que já existe hoje)
- 🟩 **Eventos do Google Calendar** do usuário (incluindo os que a IA cria automaticamente)
- 🟪 **Reuniões marcadas pela IA** destacadas com badge "IA"

Layout do mês:

```text
┌─────────────────────────────────────────────┐
│  ← Junho 2026 →    [ Mês | Semana | Dia ]   │
├──┬──┬──┬──┬──┬──┬──┤
│Se│Te│Qu│Qu│Se│Sá│Do│
├──┼──┼──┼──┼──┼──┼──┤
│  │  │  │  │  │  │  │
│ 8│ 9│10│11│12│13│14│
│  │🟦│🟩│🟦│  │  │  │
│  │tarefa│reunião│  │
└──┴──┴──┴──┴──┴──┴──┘
```

- Clicar num evento Google → abre painel lateral com detalhes (título, horário, participantes, link do Meet, botão "Abrir no Google")
- Clicar numa tarefa → abre o `OrbitTaskDialog` (igual hoje)
- Botão "Nova Tarefa" + botão "Novo Evento" (usa o `ScheduleMeetingDialog` que já existe)
- Banner sutil no topo quando o Google **não** está conectado: "Conecte sua agenda do Google para ver seus compromissos aqui → [Conectar]" (link direto para Config → Agenda)

Visões adicionais:

- **Semana** — grade horária 7×24h com blocos (estilo Google Calendar simplificado)
- **Dia** — lista vertical do dia selecionado, agrupada por hora
- **Mês** — o que já existe, enriquecido com cores

### 2. Aba Configurações → Agenda só cuida de conexão

Remover dali o card "Próximos eventos" (vai pra Tarefas). Mantém só:

- Status da conexão (Conectado / Não conectado + e-mail Google)
- Botão Conectar / Desconectar
- Campo "ID do calendário" + Fuso horário + Salvar

Fica uma aba enxuta, focada em **setup técnico** — que é o papel dela.

## Arquivos afetados

**Edge function** (`supabase/functions/orbit-google-calendar/index.ts`)
- Estender `list_events` aceitando `time_min` + `time_max` (já aceita `time_min`; falta `time_max` para filtrar por mês/semana). Pequena alteração no `_shared/google-calendar.ts`.

**Hook** (`src/hooks/useOrbitGoogleCalendar.ts`)
- Novo `useCalendarEventsRange(empresaId, start, end)` para buscar eventos num intervalo arbitrário.
- Manter `useUpcomingCalendarEvents` se ainda houver outro consumidor; senão remover.

**Componentes novos**
- `src/components/orbit/UnifiedCalendar.tsx` — calendário mês/semana/dia que recebe `tasks` + `googleEvents` e renderiza unificado.
- `src/components/orbit/CalendarEventDetailSheet.tsx` — painel lateral de detalhe de evento Google.

**Componentes editados**
- `src/pages/orbit/TarefasPage.tsx` — substituir a `TabsContent value="calendar"` pelo `<UnifiedCalendar>`; renomear label para "Agenda"; buscar eventos Google via novo hook quando empresa estiver conectada; adicionar botão "Novo Evento" que abre o `ScheduleMeetingDialog`.
- `src/components/orbit/AgendaConfigTab.tsx` — remover o `<Card>` "Próximos eventos" (linhas 170-205) e o hook `useUpcomingCalendarEvents`. Adicionar link "Ver agenda em Tarefas →".

## Lógica e consistência

- **Eventos criados pela IA** já vão pro Google Calendar via `createCalendarEvent` (o agente usa o mesmo fluxo). Para distingui-los visualmente, marcar com a tag `extendedProperties.private.source = "orbit-ai"` na criação e ler isso na UI para mostrar o badge "IA".
- **Performance**: o hook de range cacheia por `[empresaId, startISO, endISO]` no React Query (`staleTime: 60s`) — trocar de mês não refaz a query desnecessariamente.
- **Sem Google conectado**: a aba Agenda continua funcionando, só mostra tarefas + banner de conexão. Nenhum erro.
- **Multi-tenant**: as queries já filtram por `empresa_id` (RLS + edge function checa membership). Nada muda nesse aspecto.

## O que NÃO faz parte desta entrega

- Arrastar evento Google pra reagendar (Google API exige update; deixar pra v2).
- Sincronização bidirecional automática de tarefas Orbit ↔ eventos Google.
- Notificações push de lembrete.

Posso seguir com a implementação?
