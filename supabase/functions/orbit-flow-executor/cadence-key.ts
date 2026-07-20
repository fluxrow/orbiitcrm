// Helper puro: deriva a cadence_key para agendamentos de send_whatsapp_template.
// Extraído para permitir testes unitários sem inicializar o cliente supabase
// do index.ts do executor (que exige SUPABASE_URL/SERVICE_ROLE_KEY no boot e
// chama Deno.serve() como efeito colateral).

/**
 * Regra: só emite chave se TODOS os componentes semanticamente relevantes existirem
 *   — empresa_id, prospect_id, flow_id, action_id (id da orbit_flow_actions).
 * Ausência de qualquer componente → null (fail-safe, sem inventar tenant/ação).
 * Ações que não são send_whatsapp_template → null.
 */
export function computeCadenceKey(input: {
  action_type: string | null | undefined;
  empresa_id: string | null | undefined;
  prospect_id: string | null | undefined;
  flow_id: string | null | undefined;
  action_id: string | null | undefined;
}): string | null {
  if (input.action_type !== "send_whatsapp_template") return null;
  const { empresa_id, prospect_id, flow_id, action_id } = input;
  if (!empresa_id || !prospect_id || !flow_id || !action_id) return null;
  return `cad:swt:${empresa_id}:${prospect_id}:${flow_id}:${action_id}`;
}
