// Helpers puros para resolver event_id em runs do orbit-flow-executor.
// Extraído para permitir testes unitários sem inicializar o cliente supabase
// do index.ts (que exige SUPABASE_URL/SERVICE_ROLE_KEY no boot).
//
// Contrato:
//   - Dispatcher grava event_id em orbit_flow_runs.event_id (path real do trigger
//     deal_stage_changed). Ver dispatcher, insert em orbit_flow_runs.
//   - Scheduler preserva event_id em orbit_flow_scheduled_actions.context.event_id
//     via enqueueScheduledAction e restaura em handleSingleAction.
//   - Fallbacks aceitam context.event.id (Typebot/lead_recebido) e payload.event_id
//     apenas para compatibilidade com produtores legados.

export function resolveEventId(run: any): string | null {
  const direct = run?.event_id;
  if (direct) return String(direct);
  const ctxEvent = run?.context?.event?.id;
  if (ctxEvent) return String(ctxEvent);
  const ctxEventId = run?.context?.event_id;
  if (ctxEventId) return String(ctxEventId);
  const payloadEventId = run?.context?.payload?.event_id;
  if (payloadEventId) return String(payloadEventId);
  return null;
}

/**
 * Constrói o objeto `context` gravado em orbit_flow_scheduled_actions,
 * preservando event_id do run original para reconstrução do stableKey de flow_stage.
 */
export function buildScheduledActionContext(run: any): {
  payload: any;
  entity_type: string | null;
  entity_id: string | null;
  event_id: string | null;
} {
  return {
    payload: run?.context?.payload ?? {},
    entity_type: run?.entity_type ?? null,
    entity_id: run?.entity_id ?? null,
    event_id: resolveEventId(run),
  };
}

/**
 * Restaura o run consumível pelo runner a partir da linha persistida em
 * orbit_flow_scheduled_actions, garantindo que event_id volte para run.event_id.
 * Fallback aceita context.payload.event_id para agendamentos anteriores ao patch.
 */
export function restoreRunFromScheduled(s: any): any {
  const restoredEventId = s?.context?.event_id ?? s?.context?.payload?.event_id ?? null;
  return {
    id: s?.run_id,
    empresa_id: s?.empresa_id,
    flow_id: s?.flow_id,
    entity_type: s?.context?.entity_type ?? null,
    entity_id: s?.context?.entity_id ?? null,
    event_id: restoredEventId,
    context: { payload: s?.context?.payload ?? {}, event_id: restoredEventId },
    _scheduled_action_id: s?.id,
  };
}
